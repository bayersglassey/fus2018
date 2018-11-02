
/*
    Loosely based off of the official Lua plugin for UWSGI:
    https://github.com/unbit/uwsgi/blob/master/plugins/lua/lua_plugin.c
*/


#include "../uwsgi/uwsgi.h"
#include "../includes.h"


static int flush_to_request_body(fus_printer_t *printer){
    struct wsgi_request *request = printer->data;
    if(uwsgi_response_write_body_do(request, printer->buffer, printer->buffer_len))return -1;
    return printer->buffer_len;
}


static int run(fus_t *fus, const char *body, int body_len){
    fus_lexer_t *lexer = &fus->lexer;
    fus_lexer_load_chunk(lexer, body, body_len);
    fus_lexer_mark_final(lexer);

    fus_state_t *state = &fus->state;
    if(fus_state_exec_lexer(state, lexer, false) < 0)return -1;

    if(!fus_lexer_is_done(lexer)){
        fus_lexer_perror(lexer, "Lexer finished with status != done");
        return -1;
    }

    return UWSGI_OK;
}


static int serve(fus_t *fus, struct wsgi_request *request){

    /* Parse vars */
    if(uwsgi_parse_vars(request))return -1;

    /* Get body */
    ssize_t body_len = 0;
    char *body = uwsgi_request_body_read(request, -1, &body_len);
    if(body == NULL)return -1;

    /* Debug: print the body */
    //fprintf(stderr, "GOT BODY: %.*s\n", (int)body_len, body);

    /* Example: get a var */
    //uint16_t remote_addr_len = 0;
    //char *remote_addr = uwsgi_get_var(request,
    //    "REMOTE_ADDR", 11, &remote_addr_len);

    /* Write status & headers */
    if(uwsgi_response_prepare_headers(request, "200 OK", 6))return -1;
    if(uwsgi_response_add_content_type(request, "text/plain", 10))return -1;
    //if(uwsgi_response_add_header(request, "X-Fus", 5, "Yes", 3))return -1;

    /* Example: write to response body */
    //if(uwsgi_response_write_body_do(request, "Test!\n", 6))return -1;
    //if(uwsgi_response_write_body_do(request, "Another test!\n", 14))return -1;

    /* Run body as fus code */
    run(fus, body, body_len);

    /* Write result to request body */
    fus_printer_set_flush(&fus->printer, &flush_to_request_body, request);
    fus_printer_write_arr(&fus->printer, &fus->vm, &fus->state.stack);
    fus_printer_write_char(&fus->printer, '\n');
    if(fus_printer_flush(&fus->printer) < 0)return -1;

    return UWSGI_OK;
}

int uwsgi_fus_request(struct wsgi_request *request){
    fus_t fus;
    fus_init(&fus);

    int status = serve(&fus, request);

    fus_cleanup(&fus);
    return UWSGI_OK;
}



static struct uwsgi_option uwsgi_fus_options[] = {
    //{"fus", no_argument, 0, "load fus app", uwsgi_opt_set_str, &uwsgi_fus_filename, 0},
    {0, 0, 0, 0},
};

struct uwsgi_plugin fus_plugin = {
    .name = "fus",
    .modifier1 = 18,
    .options = uwsgi_fus_options,
    .request = uwsgi_fus_request,
};

