
/*
    Loosely based off of the official Lua plugin for UWSGI:
    https://github.com/unbit/uwsgi/blob/master/plugins/lua/lua_plugin.c
*/


#include "../uwsgi.h"
#include "../includes.h"



/***********
 * FUS_APP *
 ***********/

typedef struct fus_app {
    bool execpost;
    const char *filename;
    bool loaded;

    char *code;
    int code_len;

    fus_t fus;
    /* NOTE: fus.parser.arr owns the parsed code,
    fus.runner just has a pointer to it */
} fus_app_t;

static int fus_app_init(fus_app_t *app){
    app->execpost = false;
    app->filename = "<no file>";
    app->loaded = false;

    app->code = NULL;
    app->code_len = 0;

    fus_init(&app->fus);
    return 0;
}

static int fus_app_cleanup(fus_app_t *app){
    if(app->loaded){
        fprintf(stderr, "%s: Cleaning up fus app loaded from: %s\n",
            __func__, app->filename);
        free(app->code);
    }
    fus_cleanup(&app->fus);
    return 0;
}

static int fus_app_load(fus_app_t *app, const char *filename){
    if(app->loaded){
        fprintf(stderr, "%s: Fus app already loaded from %s, "
            "can't load from: %s\n",
            __func__, app->filename, filename);
        return -1;
    }

    fprintf(stderr, "%s: Loading fus app from: %s\n",
        __func__, filename);

    char *code = load_file(filename);
    if(code == NULL)return -1;

    fus_lexer_t *lexer = &app->fus.lexer;
    fus_lexer_load_chunk(lexer, code, strlen(code));
    fus_lexer_mark_final(lexer);

    fus_parser_t *parser = &app->fus.parser;
    if(fus_parser_parse_lexer(parser, lexer) < 0)goto err;
    if(!fus_lexer_is_done(lexer)){
        fus_lexer_perror(lexer, "Lexer finished with status != done");
        goto err;
    }

    fus_runner_t *runner = &app->fus.runner;
    fus_arr_t *data = &parser->arr;
    if(fus_runner_load(runner, data) < 0)goto err;
    if(fus_runner_exec_defs(runner) < 0)goto err;

    app->filename = filename;
    app->loaded = true;
    app->code = code;
    app->code_len = strlen(code);
    return 0;
err:
    free(code);
    return -1;
}



/****************************
 * FUS WEB SERVER FUNCTIONS *
 ****************************/

static int flush_to_request_body(fus_printer_t *printer){
    struct wsgi_request *request = printer->data;
    if(uwsgi_response_write_body_do(request, printer->buffer, printer->buffer_len))return -1;
    return printer->buffer_len;
}


static int run(fus_t *fus, const char *code, int code_len,
    const char *filename, const char *def_name
){
    /* Runs given code once.
    Should be able to call this function multiple times with different
    code, with none of the calls affecting each other. */

    fus_lexer_t *lexer = &fus->lexer;
    fus_lexer_reset(lexer, fus_strdup(&fus->core, filename));
    fus_lexer_load_chunk(lexer, code, code_len);
    fus_lexer_mark_final(lexer);

    fus_runner_t *runner = &fus->runner;
    fus_runner_reset(runner);
    if(fus_runner_exec_lexer(runner, lexer, def_name, false) < 0)return -1;

    if(!fus_lexer_is_done(lexer)){
        fus_lexer_perror(lexer, "Lexer finished with status != done");
        return -1;
    }

    return 0;
}


static int serve_execpost(fus_t *fus, struct wsgi_request *request){

    /* Parse vars */
    if(uwsgi_parse_vars(request))return -1;

    /* Get body */
    ssize_t body_len = 0;
    char *body = uwsgi_request_body_read(request, -1, &body_len);
    if(body == NULL)return -1;

    /* Write status & headers */
    if(uwsgi_response_prepare_headers(request, "200 OK", 6))return -1;
    if(uwsgi_response_add_content_type(request, "text/plain", 10))return -1;

    /* Run body as fus code */
    if(run(fus, body, body_len, "<execpost>", NULL) < 0)return -1;

    /* Write stack to request body */
    fus_runner_t *runner = &fus->runner;
    fus_arr_t *stack = fus_runner_get_stack(runner);
    fus_printer_set_flush(&fus->printer, &flush_to_request_body, request);
    fus_printer_write_arr(&fus->printer, &fus->vm, stack);
    fus_printer_write_char(&fus->printer, '\n');
    if(fus_printer_flush(&fus->printer) < 0)return -1;

    return 0;
}

static int parse_vars_arr(fus_vm_t *vm, fus_arr_t *a, struct wsgi_request *request){
    fus_symtable_t *table = vm->symtable;
    int sym_i_key = fus_symtable_get_or_add_from_string(table, "name");
    int sym_i_val = fus_symtable_get_or_add_from_string(table, "value");
    for(int i = 0; i < request->var_cnt; i += 2){
        char *key = request->hvec[i].iov_base;
        uint16_t key_len = request->hvec[i].iov_len;
        char *val = request->hvec[i + 1].iov_base;
        uint16_t val_len = request->hvec[i + 1].iov_len;

        fus_value_t value_key = fus_value_str(vm,
            fus_strndup(vm->core, key, key_len),
            key_len, key_len + 1);
        fus_value_t value_val = fus_value_str(vm,
            fus_strndup(vm->core, val, val_len),
            val_len, val_len + 1);

        fus_value_t value_keyval = fus_value_obj(vm);
        fus_obj_t *o_keyval = &value_keyval.p->data.o;
        fus_obj_set(vm, o_keyval, sym_i_key, value_key);
        fus_obj_set(vm, o_keyval, sym_i_val, value_val);
        /* Example value_keyval:
            obj
              "HTTP_HOST" =.name
              "localhost:9090" =.value
        */

        fus_arr_push(vm, a, value_keyval);
    }
    return 0;
}

static int write_headers_arr(fus_vm_t *vm, fus_arr_t *a, struct wsgi_request *request){
    fus_symtable_t *table = vm->symtable;
    int sym_i_key = fus_symtable_get_or_add_from_string(table, "name");
    int sym_i_val = fus_symtable_get_or_add_from_string(table, "value");

    fus_array_len_t len = fus_arr_len(vm, a);
    fus_value_t *values = FUS_ARR_VALUES(*a);
    for(int i = 0; i < len; i++){
        fus_value_t value = values[i];
        fus_obj_t *o = fus_value_obj_decode(vm, value);

        fus_value_t value_key = fus_obj_get(vm, o, sym_i_key);
        fus_value_t value_val = fus_obj_get(vm, o, sym_i_val);
        char *key = fus_value_str_decode_dup(vm, value_key);
        char *val = fus_value_str_decode_dup(vm, value_val);
        if(uwsgi_response_add_header(request, key, strlen(key), val, strlen(val)))return -1;
    }
    return 0;
}

static int serve_app(fus_app_t *app, struct wsgi_request *request){
    fus_t *fus = &app->fus;
    fus_vm_t *vm = &fus->vm;
    fus_symtable_t *symtable = &fus->symtable;
    fus_runner_t *runner = &fus->runner;
    fus_arr_t *stack = NULL;

    /* Parse vars */
    if(uwsgi_parse_vars(request))return -1;

    /* Get body */
    ssize_t body_len = 0;
    char *body = uwsgi_request_body_read(request, -1, &body_len);
    if(body == NULL)return -1;

    /* Get fus symbol indices */
    int sym_i_serve = fus_symtable_get_or_add_from_string(
        symtable, "serve_wsgi_request");
    int sym_i_status = fus_symtable_get_or_add_from_string(
        symtable, "status");
    int sym_i_headers = fus_symtable_get_or_add_from_string(
        symtable, "headers");
    int sym_i_body = fus_symtable_get_or_add_from_string(
        symtable, "body");
    int sym_i_wsgi_vars = fus_symtable_get_or_add_from_string(
        symtable, "wsgi_vars");

    /* Build request obj */
    fus_value_t value_request = fus_value_obj(vm);
    fus_obj_t *o_request = &value_request.p->data.o;
    fus_value_t value_body = fus_value_str(vm,
        fus_strndup(vm->core, body, body_len),
        body_len, body_len + 1);
    fus_obj_set(vm, o_request, sym_i_body, value_body);
    fus_value_t value_wsgi_vars = fus_value_arr(vm);
    fus_arr_t *a_wsgi_vars = &value_wsgi_vars.p->data.a;
    if(parse_vars_arr(vm, a_wsgi_vars, request))return -1;
    fus_obj_set(vm, o_request, sym_i_wsgi_vars, value_wsgi_vars);

    /* Push request onto stack */
    stack = fus_runner_get_stack(runner);
    fus_arr_push(vm, stack, value_request);

    /* Run fus webapp code */
    if(fus_runner_call(runner, sym_i_serve) < 0)return -1;
    if(fus_runner_exec(runner) < 0)return -1;
    if(fus_runner_rewind(runner) < 0)return -1;

    /* Pop response from stack */
    stack = fus_runner_get_stack(runner);
    if(fus_arr_len(vm, stack) != 1){
        fprintf(stderr, "%s: Expected 1 value (response obj) left on stack, "
            "but found %i values\n", __func__, fus_arr_len(vm, stack));
        return -1;
    }
    fus_value_t value_resp;
    if(fus_arr_pop(vm, stack, &value_resp) < 0)return -1;
    fus_obj_t *o_resp = fus_value_obj_decode(vm, value_resp);

    /* Get status, headers, body from response */
    fus_value_t value_resp_status = fus_obj_get(vm, o_resp, sym_i_status);
    fus_value_t value_resp_headers = fus_obj_get(vm, o_resp, sym_i_headers);
    fus_value_t value_resp_body = fus_obj_get(vm, o_resp, sym_i_body);
    int status = fus_value_int_decode(vm, value_resp_status);
    fus_arr_t *a_resp_headers = fus_value_arr_decode(vm, value_resp_headers);
    char *resp_body = fus_value_str_decode_dup(vm, value_resp_body);

    /* Write status, headers, body */
    if(uwsgi_response_prepare_headers_int(request, status))return -1;
    if(write_headers_arr(vm, a_resp_headers, request) < 0)return -1;
    if(uwsgi_response_write_body_do(request, resp_body, strlen(resp_body)))return -1;

    return 0;
}



/************************************
 * UWSGI FUS CALLBACKS & STRUCTURES *
 ************************************/


fus_app_t app;
bool app_execpost = false;
const char *app_filename = NULL;

static int uwsgi_fus_init(){
    fprintf(stderr, "%s: Initializing...\n", __func__);
    if(fus_app_init(&app) < 0)return -1;
    if(app_execpost){
        fprintf(stderr, "%s: Running in execpost mode!\n", __func__);
        app.execpost = app_execpost;
    }else if(app_filename){
        fprintf(stderr, "%s: Running in app mode!\n", __func__);
        if(fus_app_load(&app, app_filename) < 0)return -1;
    }else{
        fprintf(stderr, "%s: Please use --fus or --fus_execpost "
            "to select a mode\n", __func__);
        return -1;
    }
    fprintf(stderr, "%s: OK!\n", __func__);
    return UWSGI_OK;
}

static void uwsgi_fus_cleanup(){
    fus_app_cleanup(&app);
}

static int uwsgi_fus_request_execpost(struct wsgi_request *request){
    /* Implements an "execute POST"-style webserver, which expects POSTed
    data to be valid fus source code, which it runs, returning the resulting
    stack */
    fus_t fus;
    fus_init(&fus);
    if(serve_execpost(&fus, request) < 0)return -1;
    fus_cleanup(&fus);
    return UWSGI_OK;
}

static int uwsgi_fus_request_app(struct wsgi_request *request){
    /* Implements an "execute POST"-style webserver, which expects POSTed
    data to be valid fus source code, which it runs, returning the resulting
    stack */
    if(!app.loaded){
        fprintf(stderr, "%s: App not loaded\n", __func__);
        return -1;
    }
    if(serve_app(&app, request) < 0)return -1;
    return UWSGI_OK;
}

static int uwsgi_fus_request(struct wsgi_request *request){
    if(app.execpost)return uwsgi_fus_request_execpost(request);
    else return uwsgi_fus_request_app(request);
}

static struct uwsgi_option uwsgi_fus_options[] = {
    {"fus", required_argument, 0, "load fus app", uwsgi_opt_set_str, &app_filename, 0},
    {"fus_execpost", no_argument, 0, "execpost mode: POST will be executed, stack returned", uwsgi_opt_true, &app_execpost, 0},
    {0, 0, 0, 0},
};

struct uwsgi_plugin fus_plugin = {
    .name = "fus",
    .modifier1 = 18,

    .init = uwsgi_fus_init,
    //.init_apps = ?..
    .master_cleanup = uwsgi_fus_cleanup,

    .options = uwsgi_fus_options,
    .request = uwsgi_fus_request,
};

