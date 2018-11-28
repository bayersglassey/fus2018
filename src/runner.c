

#include "includes.h"



/*********
 * STATE *
 *********/

static void fus_swap_bools(bool *b1, bool *b2){
    bool temp = *b1;
    *b1 = *b2;
    *b2 = temp;
}

void fus_runner_dump_error(fus_runner_t *runner){
    fus_runner_dump_callframes(runner, stderr, true);
    //fus_runner_dump_state(runner, stderr, "Vs");
}

void fus_runner_dump_state(fus_runner_t *runner, FILE *file, const char *fmt){
    fus_vm_t *vm = runner->vm;
    fus_runner_callframe_t *callframe = fus_runner_get_callframe(runner);
    fus_obj_t *defs = &runner->defs;
    fus_arr_t *stack = fus_runner_get_stack(runner);
    fus_obj_t *vars = fus_runner_get_vars(runner);

    fus_printer_t printer;
    fus_printer_init(&printer);
    fus_printer_set_file(&printer, file);
    printer.depth = 2;

    fprintf(file, "RUNNER STATE:\n");
    char fmt_c;
    while(fmt_c = *fmt, fmt_c != '\0'){
        if(strchr("dD", fmt_c)){
            bool shallow_data = fmt_c == 'D';
            fus_swap_bools(&shallow_data, &printer.shallow_data);

            fprintf(file, "  defs:\n");
            fus_printer_write_tabs(&printer);
            fus_printer_print_obj_as_data(&printer, vm, defs);
            fprintf(file, "\n");

            fus_swap_bools(&shallow_data, &printer.shallow_data);
        }else if(strchr("vV", fmt_c)){
            bool shallow_values = fmt_c == 'V';
            fus_swap_bools(&shallow_values, &printer.shallow_values);

            fprintf(file, "  vars:\n");
            fus_printer_write_tabs(&printer);
            fus_printer_print_obj(&printer, vm, vars);
            fprintf(file, "\n");

            fus_swap_bools(&shallow_values, &printer.shallow_values);
        }else if(strchr("sS", fmt_c)){
            bool shallow_values = fmt_c == 'S';
            fus_swap_bools(&shallow_values, &printer.shallow_values);

            fprintf(file, "  stack:\n");
            fus_printer_write_tabs(&printer);
            fus_printer_print_arr(&printer, vm, stack);
            fprintf(file, "\n");

            fus_swap_bools(&shallow_values, &printer.shallow_values);
        /*
        }else if(fmt_c == 'D' || fmt_c == 'V'){
            bool *b_ptr = fmt_c == 'D'?
                &printer.shallow_data: &printer.shallow_values;
            fmt++;
            char fmt_c2 = *fmt;
            if(fmt_c2 == '+')*b_ptr = true;
            else if(fmt_c2 == '-')*b_ptr = false;
            else{
                fprintf(stderr, "%s: Unrecognized fmt_c after %c: %c\n",
                    __func__, fmt_c, fmt_c2);
            }
        */
        }else{
            fprintf(stderr, "%s: Unrecognized fmt_c: %c\n",
                __func__, fmt_c);
        }
        fmt++;
    }

    fus_printer_cleanup(&printer);
}


int fus_runner_exec_lexer(fus_runner_t *runner, fus_lexer_t *lexer,
    bool dump_parser
){
    int status = -1;

    fus_parser_t parser;
    fus_parser_init(&parser, runner->vm);

    if(fus_parser_parse_lexer(&parser, lexer) < 0)goto err;
    if(dump_parser)fus_parser_dump(&parser, stderr);
    if(fus_runner_exec_data(runner, &parser.arr) < 0)goto err;

    status = 0; /* OK! */
err:
    fus_parser_cleanup(&parser);
    return status;
}

int fus_runner_exec_data(fus_runner_t *runner, fus_arr_t *data){
    if(fus_runner_load(runner, data) < 0)return -1;
    if(fus_runner_exec_defs(runner) < 0)return -1;
    if(fus_runner_exec(runner) < 0)return -1;
    return 0;
}

int fus_runner_exec_defs(fus_runner_t *runner){
    fus_runner_callframe_t *callframe =
        fus_runner_get_root_callframe(runner);
    if(callframe == NULL)return -1;
    fus_arr_t *data = callframe->data;
    return _fus_runner_exec_defs(runner, data);
}

int _fus_runner_exec_defs(fus_runner_t *runner, fus_arr_t *data){

    fus_vm_t *vm = runner->vm;
    fus_symtable_t *symtable = vm->symtable;
    int sym_i_of = fus_symtable_get_or_add_from_string(symtable, "of");

    fus_array_len_t len = data->values.len;
    fus_value_t *values = FUS_ARR_VALUES(*data);

    for(int i = 0; i < len; i++){
        fus_value_t value = values[i];
        if(fus_value_is_arr(value)){
            if(_fus_runner_exec_defs(runner, &value.p->data.a) < 0)return -1;
        }else if(fus_value_is_sym(value)){
            int sym_i = fus_value_sym_decode(vm, value);
            const char *token = fus_symtable_get_token(symtable, sym_i);

            if(sym_i < 0 || sym_i >= FUS_KEYWORDS){
                fprintf(stderr, "%s: Builtin not found: %s\n",
                    __func__, token);
                return -1;
            }

            int n_args_in;
            int n_args_out;
            int n_args_inline;
            fus_keyword_t *keyword = &vm->keywords[sym_i];
            if(keyword->parse_args(keyword, data, i + 1,
                &n_args_in, &n_args_out, &n_args_inline) < 0)return -1;

            fus_value_t *values_inline = &values[i + 1];
            i += n_args_inline;

            if(sym_i == FUS_KEYWORD_def){
                int def_sym_i = fus_value_sym_decode(vm, values_inline[0]);

                /* Check for redefinition */
                if(fus_obj_has(vm, &runner->defs, def_sym_i)){
                    const char *token_def =
                        fus_symtable_get_token(symtable, def_sym_i);
                    fprintf(stderr, "%s: Redefinition of defs not "
                        "allowed: %s\n",
                        __func__, token_def);
                    return -1;
                }

                /* Check for "of" */
                int sym_i = fus_value_sym_decode(vm, values_inline[1]);
                if(sym_i != sym_i_of){
                    const char *token_of =
                        fus_symtable_get_token(symtable, sym_i);
                    fprintf(stderr, "%s: Unexpected sym after %s: %s\n",
                        __func__, token, token_of);
                    return -1;
                }

                /* Get function signature & data */
                fus_arr_t *sig = fus_value_arr_decode(vm, values_inline[2]);
                fus_arr_t *data = fus_value_arr_decode(vm, values_inline[3]);

                /* Create a function value */
                fus_value_t value_fun = fus_value_fun(vm, NULL, data, sig);

                /* Poke new function into runner->defs */
                fus_obj_set(vm, &runner->defs, def_sym_i, value_fun);
            }
        }else{
            /* Some kind of literal, nothing to do */
        }
    }
    return 0;
}

int fus_runner_exec(fus_runner_t *runner){
    fus_vm_t *vm = runner->vm;

#if FUS_USE_SETJMP
    /* Set up setjmp error handler */
    fus_vm_error_callback_t *old_error_callback = vm->error_callback;
    void *old_error_callback_data = vm->error_callback_data;
    vm->error_callback = &fus_vm_error_callback_runner_setjmp;
    vm->error_callback_data = runner;
    if(setjmp(runner->error_jmp_buf)){
        /* We should only arrive here if the error handler called longjmp */

        /* Restore old error callback handler */
        vm->error_callback = old_error_callback;
        vm->error_callback_data = old_error_callback_data;

        /* Dump error info and report failure to caller */
        fus_runner_dump_error(runner);
        return -1;
    }
#endif

    while(!fus_runner_is_done(runner)){
        if(fus_runner_step(runner) < 0)return -1;
    }

#if FUS_USE_SETJMP
    /* Restore old error callback handler */
    vm->error_callback = old_error_callback;
    vm->error_callback_data = old_error_callback_data;
#endif

    return 0;
}



/********************
 * RUNNER CALLFRAME *
 ********************/

void fus_runner_callframe_init(fus_runner_callframe_t *callframe,
    fus_runner_t *runner, fus_runner_callframe_type_t type,
    fus_arr_t *data
){
    callframe->runner = runner;
    callframe->type = type;
    callframe->inherits = fus_runner_callframe_type_inherits(type);
    callframe->fun_boxed = NULL;
    callframe->data = data;
    callframe->i = 0;

    fus_arr_init(runner->vm, &callframe->stack);
    fus_obj_init(runner->vm, &callframe->vars);
}

void fus_runner_callframe_cleanup(fus_runner_callframe_t *callframe){
    fus_vm_t *vm = callframe->runner->vm;
    if(callframe->fun_boxed != NULL)fus_boxed_detach(callframe->fun_boxed);
    fus_runner_callframe_type_t type = callframe->type;
    if(type == FUS_CALLFRAME_TYPE_ARR_FOR){
        fus_boxed_detach(callframe->loop_data.arr_for.boxed);
    }
    fus_arr_cleanup(vm, &callframe->stack);
    fus_obj_cleanup(vm, &callframe->vars);
}

bool fus_runner_callframe_type_inherits(fus_runner_callframe_type_t type){
    /* Decide whether this type of callframe inherits stack+vars from
    previous callframe */
    static const bool inherits_by_type[FUS_CALLFRAME_TYPES] = {
        false, /* MODULE */
        false, /* DEF */
        true,  /* PAREN */
        true,  /* IF */
        true,  /* DO */
        true,  /* INT_FOR */
        true   /* ARR_FOR */
    };
    return inherits_by_type[type];
}

bool fus_runner_callframe_type_is_do_like(fus_runner_callframe_type_t type){
    /* Which types of callframe you can break out of and/or loop */
    return
        type == FUS_CALLFRAME_TYPE_MODULE ||
        type == FUS_CALLFRAME_TYPE_DEF ||
        type == FUS_CALLFRAME_TYPE_DO ||
        type == FUS_CALLFRAME_TYPE_INT_FOR ||
        type == FUS_CALLFRAME_TYPE_ARR_FOR;
}



/**********
 * RUNNER *
 **********/

void fus_runner_init(fus_runner_t *runner, fus_vm_t *vm){
    runner->vm = vm;

    fus_obj_init(vm, &runner->defs);

    /* Init callframe class */
    fus_class_init(&runner->class_callframe, vm->core,
        "runner_callframe", sizeof(fus_runner_callframe_t), runner,
        fus_class_instance_init_zero,
        fus_class_cleanup_runner_callframe);

    /* Init callframe array */
    fus_array_init(&runner->callframes, &runner->class_callframe);
    fus_runner_push_callframe(runner, FUS_CALLFRAME_TYPE_MODULE, NULL);
}

void fus_runner_cleanup(fus_runner_t *runner){
    fus_obj_cleanup(runner->vm, &runner->defs);
    fus_array_cleanup(&runner->callframes);
}

void fus_runner_reset(fus_runner_t *runner){
    fus_vm_t *vm = runner->vm;
    fus_runner_cleanup(runner);
    fus_runner_init(runner, vm);
}

int fus_runner_load(fus_runner_t *runner, fus_arr_t *data){
    fus_runner_callframe_t *callframe =
        fus_runner_get_root_callframe(runner);
    if(callframe == NULL)return -1;
    callframe->data = data;
    callframe->i = 0;
    return 0;
}

int fus_runner_rewind(fus_runner_t *runner){
    fus_runner_callframe_t *callframe =
        fus_runner_get_root_callframe(runner);
    if(callframe == NULL)return -1;
    callframe->i = 0;
    return 0;
}

void fus_runner_dump_callframes(fus_runner_t *runner, FILE *file,
    bool end_at_here
){
    fus_vm_t *vm = runner->vm;

    fus_printer_t printer;
    fus_printer_init(&printer);
    fus_printer_set_file(&printer, file);

    printer.shallow_data = true;

    fprintf(file, "RUNNER CALLFRAMES:\n");

    int callframes_len = runner->callframes.len;
    for(int i = 0; i < callframes_len; i++){
        printer.depth = i + 1;
        fus_runner_callframe_t *callframe =
            FUS_ARRAY_GET_REF(runner->callframes, i);

        if(!callframe->inherits){
            bool dump_vars = true;
            if(dump_vars){
                fus_printer_write_newline(&printer);
                fus_printer_write_text(&printer, "VARS:");
                printer.depth++;
                fus_printer_write_newline(&printer);
                fus_printer_print_obj(&printer, vm, &callframe->vars);
                printer.depth--;
            }
            bool dump_stack = true;
            if(dump_stack){
                fus_printer_write_newline(&printer);
                fus_printer_write_text(&printer, "STACK:");
                printer.depth++;
                fus_printer_write_newline(&printer);
                fus_printer_print_arr(&printer, vm, &callframe->stack);
                printer.depth--;
            }
        }

        if(callframe->data != NULL){
            fus_printer_write_newline(&printer);
            fus_printer_print_data(&printer, vm, callframe->data,
                0, callframe->i + 1);
        }
    }
    fus_printer_write_text(&printer, "    <-- HERE");
    if(!end_at_here)for(int i = callframes_len - 1; i >= 0; i--){
        printer.depth = i + 1;
        fus_runner_callframe_t *callframe =
            FUS_ARRAY_GET_REF(runner->callframes, i);

        if(callframe->data != NULL){
            fus_printer_write_newline(&printer);
            fus_printer_print_data(&printer, vm, callframe->data,
                callframe->i + 1, -1);
        }
    }
    fus_printer_write_text(&printer, "\n");

    fus_printer_cleanup(&printer);
}



void fus_vm_error_callback_runner_setjmp(fus_vm_t *vm, fus_err_code_t code){
    const char *msg = fus_err_code_msg(code);
    fus_runner_t *runner = vm->error_callback_data;
    fprintf(stderr, "%s: Caught error: %s\n", __func__, msg);
    FUS_BACKTRACE

#if FUS_USE_SETJMP
    longjmp(runner->error_jmp_buf, 1);
#else
    fprintf(stderr, "%s: Should never be called if FUS_USE_SETJMP is off!\n",
        __func__);
    exit(EXIT_FAILURE);
#endif
}



fus_runner_callframe_t *fus_runner_get_root_callframe(fus_runner_t *runner){
    if(runner->callframes.len < 1){
        fprintf(stderr, "%s: Runner has no root callframe\n", __func__);
        return NULL;
    }
    if(runner->callframes.len > 1){
        fprintf(stderr, "%s: Runner is not at root callframe (%i deep)\n",
            __func__, runner->callframes.len);
        return NULL;
    }
    return fus_runner_get_callframe(runner);
}

fus_runner_callframe_t *fus_runner_get_callframe(fus_runner_t *runner){
    int callframes_len = runner->callframes.len;
    if(callframes_len < 1)return NULL;
    return FUS_ARRAY_GET_REF(runner->callframes, callframes_len - 1);
}

fus_runner_callframe_t *fus_runner_get_data_callframe(
    fus_runner_t *runner, bool old
){
    /* The "data callframe" is the one which owns current stack and vars.
    All callframes after it "inherit" its stack and vars.
    If old==true, we assume current callframe is a data callframe, and
    return the data callframe "behind" it.
    (Basically we're assuming it's about to be popped, and want to get
    at the old stack which will be revealed) */

    int callframes_len = runner->callframes.len;
    int i0 = callframes_len - (old? 2: 1);
    for(int i = i0; i >= 0; i--){
        fus_runner_callframe_t *callframe =
            FUS_ARRAY_GET_REF(runner->callframes, i);
        if(!callframe->inherits)return callframe;
    }
    return NULL;
}

fus_arr_t *fus_runner_get_stack(fus_runner_t *runner){
    fus_runner_callframe_t *callframe = fus_runner_get_data_callframe(
        runner, false);
    if(callframe == NULL)return NULL;
    return &callframe->stack;
}

fus_obj_t *fus_runner_get_vars(fus_runner_t *runner){
    fus_runner_callframe_t *callframe = fus_runner_get_data_callframe(
        runner, false);
    if(callframe == NULL)return NULL;
    return &callframe->vars;
}

bool fus_runner_is_done(fus_runner_t *runner){
    fus_runner_callframe_t *callframe = fus_runner_get_callframe(runner);
    if(callframe == NULL)return true;
    if(runner->callframes.len == 1){
        /* This is the root callframe */
        fus_arr_t *data = callframe->data;
        int i = callframe->i;
        fus_value_t *token_values = FUS_ARR_VALUES(*data);
        int token_values_len = data->values.len;
        return i >= token_values_len;
    }
    return false;
}

fus_runner_callframe_t *fus_runner_push_callframe(fus_runner_t *runner,
    fus_runner_callframe_type_t type, fus_arr_t *data
){
    fus_array_push(&runner->callframes);
    fus_runner_callframe_t *callframe = fus_runner_get_callframe(runner);
    fus_runner_callframe_init(callframe, runner, type, data);
    return callframe;
}

fus_runner_callframe_t *fus_runner_push_callframe_fun(fus_runner_t *runner,
    fus_runner_callframe_type_t type, fus_boxed_t *f_boxed
){
    /* Passes ownership of f_boxed to new callframe */

    fus_fun_t *f = &f_boxed->data.f;
    fus_runner_callframe_t *callframe =
        fus_runner_push_callframe(runner, type, &f->data);
    callframe->fun_boxed = f_boxed;
    {
        /* Move values from old stack to new stack */
        fus_vm_t *vm = runner->vm;
        fus_runner_callframe_t *old_data_callframe =
            fus_runner_get_data_callframe(runner, true);
        fus_arr_t *old_stack = &old_data_callframe->stack;
        fus_arr_t *new_stack = &callframe->stack;
        for(int i = 0; i < f->sig_in; i++){
            fus_value_t value;
            if(fus_arr_pop(vm, old_stack, &value) < 0)break;
            fus_arr_lpush(vm, new_stack, value);
        }
    }
    return callframe;
}

void fus_runner_pop_callframe(fus_runner_t *runner){
    fus_runner_callframe_t *callframe = fus_runner_get_callframe(runner);
    if(callframe->fun_boxed != NULL){
        /* Move values from new stack to old stack */
        fus_fun_t *f = &callframe->fun_boxed->data.f;
        fus_vm_t *vm = runner->vm;
        fus_runner_callframe_t *old_data_callframe =
            fus_runner_get_data_callframe(runner, true);
        fus_arr_t *old_stack = &old_data_callframe->stack;
        fus_arr_t *new_stack = &callframe->stack;
        for(int i = 0; i < f->sig_out; i++){
            fus_value_t value;
            if(fus_arr_lpop(vm, new_stack, &value) < 0)break;
            fus_arr_push(vm, old_stack, value);
        }
    }
    fus_runner_callframe_cleanup(callframe);
    fus_array_pop(&runner->callframes);
}

void fus_runner_start_callframe(fus_runner_t *runner,
    fus_runner_callframe_t *callframe
){
    fus_vm_t *vm = runner->vm;
    fus_runner_callframe_type_t type = callframe->type;
    if(type == FUS_CALLFRAME_TYPE_INT_FOR){
        int i = callframe->loop_data.int_for.i;
        int n = callframe->loop_data.int_for.n;

        fus_value_t value = fus_value_int(vm, i);
        fus_arr_t *stack = fus_runner_get_stack(runner);
        fus_arr_push(vm, stack, value);
    }else if(type == FUS_CALLFRAME_TYPE_ARR_FOR){
        int i = callframe->loop_data.arr_for.i;
        fus_arr_t *a = &callframe->loop_data.arr_for.boxed->data.a;

        fus_value_t value = fus_arr_get(vm, a, i);
        fus_arr_t *stack = fus_runner_get_stack(runner);
        fus_arr_push(vm, stack, value);
        fus_value_attach(vm, value);
    }
}

void fus_runner_end_callframe(fus_runner_t *runner){
    if(runner->callframes.len > 1){
        fus_runner_callframe_t *callframe = fus_runner_get_callframe(runner);
        fus_runner_callframe_type_t type = callframe->type;
        if(type == FUS_CALLFRAME_TYPE_INT_FOR){
            int i = ++callframe->loop_data.int_for.i;
            int n = callframe->loop_data.int_for.n;
            if(i < n){
                callframe-> i = 0; /* Callframe loops */
                fus_runner_start_callframe(runner, callframe);
                return; /* Don't pop the callframe, it's looping! */
            }
        }else if(type == FUS_CALLFRAME_TYPE_ARR_FOR){
            int i = ++callframe->loop_data.arr_for.i;
            fus_arr_t *a = &callframe->loop_data.arr_for.boxed->data.a;
            fus_array_len_t len = a->values.len;
            if(i < len){
                callframe-> i = 0; /* Callframe loops */
                fus_runner_start_callframe(runner, callframe);
                return; /* Don't pop the callframe, it's looping! */
            }
        }
        fus_runner_pop_callframe(runner);
    }else{
        /* Don't pop the root callframe!
        That's how caller can inspect stack/vars/etc. */
    }
}

int fus_runner_break_or_loop(fus_runner_t *runner, const char *token, char c){
    fus_runner_callframe_t *callframe = fus_runner_get_callframe(runner);
    while(!fus_runner_callframe_type_is_do_like(callframe->type)){
        fus_runner_pop_callframe(runner);
        callframe = fus_runner_get_callframe(runner);
        if(callframe == NULL){
            fprintf(stderr, "%s: \"%s\" at toplevel\n",
                token, __func__);
            return -1;
        }
    }
    if(c == 'b'){
        /* 'b' for "break" */
        fus_runner_pop_callframe(runner);
    }else if(c == 'l'){
        /* 'l' for "loop" */
        callframe->i = 0;
    }else{
        fprintf(stderr, "%s: '%c' not one of 'b', 'l'\n", __func__, c);
        return -1;
    }
    return 0;
}



/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_cleanup_runner_callframe(fus_class_t *class, void *ptr){
    fus_runner_callframe_t *callframe = ptr;
    fus_runner_callframe_cleanup(callframe);
}
