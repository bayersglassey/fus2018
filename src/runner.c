

#include "includes.h"


#define FUS_RUNNER_SUPER_HACKY_DEBUG_INFO 0
#define FUS_RUNNER_SUPER_HACKY_TABS() { \
    printf(":D"); \
    int callframes_len = runner->callframes.len; \
    for(int i = 0; i < callframes_len; i++)printf("  "); \
}



/*********
 * STATE *
 *********/

static void fus_swap_bools(bool *b1, bool *b2){
    bool temp = *b1;
    *b1 = *b2;
    *b2 = temp;
}

static void fus_runner_dump_error(fus_runner_t *runner){
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

    if(fus_runner_unload(runner) < 0)return -1;
    return 0;
}



/**********
 * RUNNER *
 **********/

static bool fus_runner_callframe_type_inherits(
    fus_runner_callframe_type_t type
){
    /* Decide whether this type of callframe inherits stack+vars from
    previous callframe */
    static const bool inherits_by_type[FUS_CALLFRAME_TYPES] = {
        false, /* MODULE */
        false, /* DEF */
        true,  /* PAREN */
        true,  /* IF */
        true   /* DO */
    };
    return inherits_by_type[type];
}

void fus_runner_callframe_init(fus_runner_callframe_t *callframe,
    fus_runner_t *runner, fus_runner_callframe_type_t type,
    fus_arr_t *data
){
    callframe->runner = runner;
    callframe->type = type;
    callframe->inherits = fus_runner_callframe_type_inherits(type);
    callframe->fun = NULL;
    callframe->data = data;
    callframe->i = 0;

    fus_arr_init(runner->vm, &callframe->stack);
    fus_obj_init(runner->vm, &callframe->vars);
}

void fus_runner_callframe_cleanup(fus_runner_callframe_t *callframe){
    fus_arr_cleanup(callframe->runner->vm, &callframe->stack);
    fus_obj_cleanup(callframe->runner->vm, &callframe->vars);
}

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

static fus_runner_callframe_t *fus_runner_get_root_callframe(
    fus_runner_t *runner
){
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

int fus_runner_load(fus_runner_t *runner, fus_arr_t *data){
    fus_runner_callframe_t *callframe =
        fus_runner_get_root_callframe(runner);
    if(callframe == NULL)return -1;
    callframe->data = data;
    callframe->i = 0;
    return 0;
}

int fus_runner_unload(fus_runner_t *runner){
    fus_runner_callframe_t *callframe =
        fus_runner_get_root_callframe(runner);
    if(callframe == NULL)return -1;
    callframe->data = NULL;
    callframe->i = 0;
    return 0;
}

void fus_runner_cleanup(fus_runner_t *runner){
    fus_obj_cleanup(runner->vm, &runner->defs);
    fus_array_cleanup(&runner->callframes);
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



fus_runner_callframe_t *fus_runner_get_callframe(fus_runner_t *runner){
    int callframes_len = runner->callframes.len;
    if(callframes_len < 1)return NULL;
    return FUS_ARRAY_GET_REF(runner->callframes, callframes_len - 1);
}

static fus_runner_callframe_t *fus_runner_get_data_callframe(
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

void fus_runner_push_callframe(fus_runner_t *runner,
    fus_runner_callframe_type_t type, fus_arr_t *data
){
    fus_array_push(&runner->callframes);
    fus_runner_callframe_t *callframe = fus_runner_get_callframe(runner);
    fus_runner_callframe_init(callframe, runner, type, data);
}

void fus_runner_push_callframe_fun(fus_runner_t *runner,
    fus_runner_callframe_type_t type, fus_fun_t *f
){
    fus_runner_push_callframe(runner, type, &f->data);
    fus_runner_callframe_t *callframe = fus_runner_get_callframe(runner);
    callframe->fun = f;
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
}

void fus_runner_pop_callframe(fus_runner_t *runner){
    fus_runner_callframe_t *callframe = fus_runner_get_callframe(runner);
    if(callframe->fun != NULL){
        /* Move values from new stack to old stack */
        fus_fun_t *f = callframe->fun;
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

void fus_runner_end_callframe(fus_runner_t *runner){
    if(runner->callframes.len > 1){
        /* Don't pop the root callframe!
        That's how caller can inspect stack/vars/etc. */
        fus_runner_pop_callframe(runner);
    }
}

static int fus_runner_break_or_loop(fus_runner_t *runner, const char *token,
    char c
){
    fus_runner_callframe_t *callframe = fus_runner_get_callframe(runner);
    while(callframe->type != FUS_CALLFRAME_TYPE_DO){
        fus_runner_pop_callframe(runner);
        callframe = fus_runner_get_callframe(runner);
        if(callframe == NULL){
            fprintf(stderr, "%s: %s not in do(...)\n",
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

int fus_runner_step(fus_runner_t *runner){

    /* Get some variables from callframe */
    fus_runner_callframe_t *callframe = fus_runner_get_callframe(runner);
    if(callframe == NULL){
        fprintf(stderr, "%s: Stepping a done runner is an error!\n",
            __func__);
        goto err;
    }
    fus_arr_t *data = callframe->data;
    int i = callframe->i;
    fus_value_t *token_values = FUS_ARR_VALUES(*data);
    int token_values_len = data->values.len;
    if(i >= token_values_len){
        /* End callframe if we've reached end of data.
        Doing so counts as a complete step. */
        fus_runner_end_callframe(runner);
        return 0;
    }
    fus_value_t token_value = token_values[i];

    /* Get some variables from vm */
    fus_vm_t *vm = runner->vm;
    fus_symtable_t *symtable = vm->symtable;

    /* Get stack, vars */
    fus_arr_t *stack = fus_runner_get_stack(runner);
    fus_obj_t *vars = fus_runner_get_vars(runner);

    {

        #define FUS_STATE_NEXT_VALUE() \
            i++; \
            if(i >= token_values_len){ \
                fprintf(stderr, "%s: Missing arg after %s\n", \
                    __func__, token); \
                goto err; \
            } \
            token_value = token_values[i];

        #define FUS_STATE_PEEK_NEXT_VALUE(VALUE) \
            if(i + 1 >= token_values_len){ \
                (VALUE) = fus_value_null(vm); \
            }else{ \
                (VALUE) = token_values[i + 1]; \
            }

        #define FUS_STATE_EXPECT_T(T) \
            if(!fus_value_is_##T(token_value)){ \
                fprintf(stderr, "%s: Expected " #T " after %s, got: %s\n", \
                    __func__, token, fus_value_type_msg(token_value)); \
                goto err; \
            }

        #define FUS_STATE_EXPECT_SYM(TOKEN) \
            FUS_STATE_EXPECT_T(SYM) \
            { \
                int __sym_i = fus_value_sym_decode(vm, token_value); \
                const char *__token = fus_symtable_get_token(symtable, sym_i); \
                const char *__token_expected = (TOKEN); \
                if(strcmp(__token, __token_expected)){ \
                    fprintf(stderr, "%s: Expected \"%s\" after %s, " \
                        "but got: %s\n", \
                        __func__, __token_expected, token, __token); \
                    goto err; \
                } \
            }

        #define FUS_STATE_STACK_POP(VPTR) \
            if(fus_arr_pop(vm, stack, (VPTR)))goto err;

        #define FUS_STATE_STACK_PUSH(VALUE) \
            fus_arr_push(vm, stack, (VALUE));

        #if FUS_RUNNER_SUPER_HACKY_DEBUG_INFO
        if(!fus_value_is_sym(token_value)){
            FUS_RUNNER_SUPER_HACKY_TABS()
            printf("%s\n", fus_value_type_msg(token_value));
        }
        #endif

        if(fus_value_is_int(token_value) || fus_value_is_str(token_value)){
            fus_value_attach(vm, token_value);
            FUS_STATE_STACK_PUSH(token_value)
        }else if(fus_value_is_sym(token_value)){
            int sym_i = fus_value_sym_decode(vm, token_value);
            const char *token = fus_symtable_get_token(symtable, sym_i);

            #if FUS_RUNNER_SUPER_HACKY_DEBUG_INFO
            FUS_RUNNER_SUPER_HACKY_TABS()
            printf("%s\n", token);
            #endif

            if(!strcmp(token, "`")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                int sym_i = fus_value_sym_decode(vm, token_value);
                const char *quoted_token = fus_symtable_get_token(
                    symtable, sym_i);
                fus_value_t value = fus_value_stringparse_sym(vm,
                    quoted_token);
                FUS_STATE_STACK_PUSH(value)
            }else if(!strcmp(token, "typeof")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                const char *type_name = fus_value_type_msg(value);
                fus_value_detach(vm, value);
                int sym_i = fus_symtable_get_or_add_from_string(
                    vm->symtable, type_name);
                fus_value_t value_sym = fus_value_sym(vm, sym_i);
                FUS_STATE_STACK_PUSH(value_sym)
            }else if(!strcmp(token, "null")){
                fus_value_t value = fus_value_null(vm);
                FUS_STATE_STACK_PUSH(value)
            }else if(!strcmp(token, "T")){
                fus_value_t value = fus_value_bool(vm, true);
                FUS_STATE_STACK_PUSH(value)
            }else if(!strcmp(token, "F")){
                fus_value_t value = fus_value_bool(vm, false);
                FUS_STATE_STACK_PUSH(value)
            }else if(!strcmp(token, "not")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_value_t new_value = fus_value_bool_not(vm, value);
                FUS_STATE_STACK_PUSH(new_value)
            }else if(!strcmp(token, "neg")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_value_t new_value = fus_value_int_neg(vm, value);
                FUS_STATE_STACK_PUSH(new_value)
            }else if(!strcmp(token, "int_tostr")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_value_t new_value = fus_value_int_tostr(vm, value);
                FUS_STATE_STACK_PUSH(new_value)
            }else if(!strcmp(token, "sym_tostr")){
                fus_value_t value_sym;
                FUS_STATE_STACK_POP(&value_sym)
                int sym_i = fus_value_sym_decode(vm, value_sym);
                const char *text = fus_symtable_get_token(vm->symtable,
                    sym_i);
                fus_value_t value_s = fus_value_str_from_text(vm, text);
                FUS_STATE_STACK_PUSH(value_s)
                fus_value_detach(vm, value_sym);

            #define FUS_RUNNER_INT_BINOP(TOK, OP) \
            }else if(!strcmp(token, TOK)) { \
                fus_value_t value1; \
                fus_value_t value2; \
                FUS_STATE_STACK_POP(&value2) \
                FUS_STATE_STACK_POP(&value1) \
                fus_value_t value3 = fus_value_int_##OP(vm, \
                    value1, value2); \
                FUS_STATE_STACK_PUSH(value3)

            FUS_RUNNER_INT_BINOP("+", add)
            FUS_RUNNER_INT_BINOP("-", sub)
            FUS_RUNNER_INT_BINOP("*", mul)
            //FUS_RUNNER_INT_BINOP("/", div)
            FUS_RUNNER_INT_BINOP("==", eq)
            FUS_RUNNER_INT_BINOP("!=", ne)
            FUS_RUNNER_INT_BINOP("<", lt)
            FUS_RUNNER_INT_BINOP(">", gt)
            FUS_RUNNER_INT_BINOP("<=", le)
            FUS_RUNNER_INT_BINOP(">=", ge)

            #define FUS_RUNNER_IS(T) \
            }else if(!strcmp(token, "is_" #T)) { \
                fus_value_t value; \
                FUS_STATE_STACK_POP(&value) \
                fus_value_t value_is = fus_value_bool(vm, \
                    fus_value_is_##T(value)); \
                fus_value_detach(vm, value); \
                FUS_STATE_STACK_PUSH(value_is)

            FUS_RUNNER_IS(int)
            FUS_RUNNER_IS(sym)
            FUS_RUNNER_IS(null)
            FUS_RUNNER_IS(bool)
            FUS_RUNNER_IS(arr)
            FUS_RUNNER_IS(str)
            FUS_RUNNER_IS(obj)
            FUS_RUNNER_IS(fun)

            #define FUS_RUNNER_EQ(T) \
            }else if(!strcmp(token, #T "eq")){ \
                fus_value_t value1; \
                fus_value_t value2; \
                FUS_STATE_STACK_POP(&value2) \
                FUS_STATE_STACK_POP(&value1) \
                fus_value_t value3 = fus_value_##T##eq(vm, \
                    value1, value2); \
                fus_value_detach(vm, value1); \
                fus_value_detach(vm, value2); \
                FUS_STATE_STACK_PUSH(value3)

            FUS_RUNNER_EQ()
            FUS_RUNNER_EQ(int_)
            FUS_RUNNER_EQ(sym_)
            FUS_RUNNER_EQ(bool_)
            //FUS_RUNNER_EQ(arr_)
            FUS_RUNNER_EQ(str_)
            //FUS_RUNNER_EQ(obj_)
            //FUS_RUNNER_EQ(fun_)

            }else if(!strcmp(token, "arr")){
                fus_value_t value = fus_value_arr(vm);
                FUS_STATE_STACK_PUSH(value)
            }else if(!strcmp(token, "obj")){
                fus_value_t value = fus_value_obj(vm);
                FUS_STATE_STACK_PUSH(value)
            }else if(!strcmp(token, "tuple")){
                FUS_STATE_NEXT_VALUE()
                fus_value_t value_n = token_value;
                int n = fus_value_int_decode(vm, value_n);

                fus_value_t value_a = fus_value_arr(vm);
                fus_arr_t *a = &value_a.p->data.a;
                for(int i = 0; i < n; i++){
                    fus_value_t value;
                    FUS_STATE_STACK_POP(&value)
                    fus_arr_lpush(vm, a, value);
                }
                FUS_STATE_STACK_PUSH(value_a)
            }else if(!strcmp(token, ",") || !strcmp(token, "push")){
                fus_value_t value_a;
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_STACK_POP(&value_a)
                fus_value_arr_push(vm, &value_a, value);
                FUS_STATE_STACK_PUSH(value_a)
            }else if(!strcmp(token, "lpush")){
                fus_value_t value_a;
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_STACK_POP(&value_a)
                fus_value_arr_lpush(vm, &value_a, value);
                FUS_STATE_STACK_PUSH(value_a)
            }else if(!strcmp(token, "pop")){
                fus_value_t value_a;
                fus_value_t value;
                FUS_STATE_STACK_POP(&value_a)
                fus_value_arr_pop(vm, &value_a, &value);
                FUS_STATE_STACK_PUSH(value_a)
                FUS_STATE_STACK_PUSH(value)
            }else if(!strcmp(token, "lpop")){
                fus_value_t value_a;
                fus_value_t value;
                FUS_STATE_STACK_POP(&value_a)
                fus_value_arr_lpop(vm, &value_a, &value);
                FUS_STATE_STACK_PUSH(value_a)
                FUS_STATE_STACK_PUSH(value)
            }else if(!strcmp(token, "join")){
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                fus_value_arr_join(vm, &value1, value2);
                FUS_STATE_STACK_PUSH(value1)
                fus_value_detach(vm, value2);
            }else if(!strcmp(token, "slice")){
                fus_value_t value_a;
                fus_value_t value_i;
                fus_value_t value_len;
                FUS_STATE_STACK_POP(&value_len)
                FUS_STATE_STACK_POP(&value_i)
                FUS_STATE_STACK_POP(&value_a)
                fus_value_arr_slice(vm, &value_a, value_i, value_len);
                FUS_STATE_STACK_PUSH(value_a)
                fus_value_detach(vm, value_len);
                fus_value_detach(vm, value_i);
            }else if(!strcmp(token, "=.$")){
                fus_value_t value_a;
                fus_value_t value;
                fus_value_t value_i;
                FUS_STATE_STACK_POP(&value_i)
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_STACK_POP(&value_a)
                fus_value_arr_set(vm, &value_a, value_i, value);
                FUS_STATE_STACK_PUSH(value_a)
                fus_value_detach(vm, value_i);
            }else if(!strcmp(token, ".$")){
                fus_value_t value_a;
                fus_value_t value_i;
                FUS_STATE_STACK_POP(&value_i)
                FUS_STATE_STACK_POP(&value_a)
                fus_value_t value = fus_value_arr_get(vm, value_a, value_i);
                fus_value_attach(vm, value);
                FUS_STATE_STACK_PUSH(value)
                fus_value_detach(vm, value_a);
                fus_value_detach(vm, value_i);
            }else if(!strcmp(token, "..$")){
                fus_value_t value_a;
                fus_value_t value_i;
                FUS_STATE_STACK_POP(&value_i)
                FUS_STATE_STACK_POP(&value_a)

                /* fus_value_arr_rip ...? */
                fus_value_t value = fus_value_arr_get(vm, value_a, value_i);
                fus_value_attach(vm, value);
                fus_value_arr_set(vm, &value_a, value_i, fus_value_null(vm));

                FUS_STATE_STACK_PUSH(value_a)
                FUS_STATE_STACK_PUSH(value)
                fus_value_detach(vm, value_i);
            }else if(!strcmp(token, "=.") || !strcmp(token, "set")){
                int sym_i = -1;
                if(token[0] == 's'){
                    /* "set" */
                    fus_value_t value_sym;
                    FUS_STATE_STACK_POP(&value_sym)
                    sym_i = fus_value_sym_decode(vm, value_sym);
                    fus_value_detach(vm, value_sym);
                }else{
                    /* "=." */
                    FUS_STATE_NEXT_VALUE()
                    FUS_STATE_EXPECT_T(sym)
                    sym_i = fus_value_sym_decode(vm, token_value);
                }
                fus_value_t value_o;
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_STACK_POP(&value_o)
                fus_value_obj_set(vm, &value_o, sym_i, value);
                FUS_STATE_STACK_PUSH(value_o)
            }else if(!strcmp(token, ".") || !strcmp(token, "get")){
                int sym_i = -1;
                if(token[0] == 'g'){
                    /* "get" */
                    fus_value_t value_sym;
                    FUS_STATE_STACK_POP(&value_sym)
                    sym_i = fus_value_sym_decode(vm, value_sym);
                    fus_value_detach(vm, value_sym);
                }else{
                    /* "." */
                    FUS_STATE_NEXT_VALUE()
                    FUS_STATE_EXPECT_T(sym)
                    sym_i = fus_value_sym_decode(vm, token_value);
                }
                fus_value_t value_o;
                FUS_STATE_STACK_POP(&value_o)
                fus_value_t value = fus_value_obj_get(vm, value_o, sym_i);
                fus_value_attach(vm, value);
                FUS_STATE_STACK_PUSH(value)
                fus_value_detach(vm, value_o);
            }else if(!strcmp(token, "..") || !strcmp(token, "rip")){
                int sym_i = -1;
                if(token[0] == 'r'){
                    /* "rip" */
                    fus_value_t value_sym;
                    FUS_STATE_STACK_POP(&value_sym)
                    sym_i = fus_value_sym_decode(vm, value_sym);
                    fus_value_detach(vm, value_sym);
                }else{
                    /* ".." */
                    FUS_STATE_NEXT_VALUE()
                    FUS_STATE_EXPECT_T(sym)
                    sym_i = fus_value_sym_decode(vm, token_value);
                }
                fus_value_t value_o;
                FUS_STATE_STACK_POP(&value_o)
                fus_value_t value = fus_value_obj_get(vm, value_o, sym_i);
                fus_value_attach(vm, value);
                fus_value_obj_set(vm, &value_o, sym_i, fus_value_null(vm));
                FUS_STATE_STACK_PUSH(value_o)
                FUS_STATE_STACK_PUSH(value)
            }else if(!strcmp(token, "?.") || !strcmp(token, "has")){
                int sym_i = -1;
                if(token[0] == 'h'){
                    /* "has" */
                    fus_value_t value_sym;
                    FUS_STATE_STACK_POP(&value_sym)
                    sym_i = fus_value_sym_decode(vm, value_sym);
                    fus_value_detach(vm, value_sym);
                }else{
                    /* "?." */
                    FUS_STATE_NEXT_VALUE()
                    FUS_STATE_EXPECT_T(sym)
                    sym_i = fus_value_sym_decode(vm, token_value);
                }
                fus_value_t value_o;
                FUS_STATE_STACK_POP(&value_o)
                fus_value_t value_has = fus_value_obj_has(vm, value_o, sym_i);
                FUS_STATE_STACK_PUSH(value_has)
                fus_value_detach(vm, value_o);
            }else if(!strcmp(token, "len")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_value_t value_len = fus_value_arr_len(vm, value);
                FUS_STATE_STACK_PUSH(value_len)
                fus_value_detach(vm, value);
            }else if(!strcmp(token, "str_len")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_value_t value_len = fus_value_str_len(vm, value);
                FUS_STATE_STACK_PUSH(value_len)
                fus_value_detach(vm, value);
            }else if(!strcmp(token, "str_join")){
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                fus_value_str_join(vm, &value1, value2);
                FUS_STATE_STACK_PUSH(value1)
                fus_value_detach(vm, value2);
            }else if(!strcmp(token, "str_slice")){
                fus_value_t value_s;
                fus_value_t value_i;
                fus_value_t value_len;
                FUS_STATE_STACK_POP(&value_len)
                FUS_STATE_STACK_POP(&value_i)
                FUS_STATE_STACK_POP(&value_s)
                fus_value_str_slice(vm, &value_s, value_i, value_len);
                FUS_STATE_STACK_PUSH(value_s)
                fus_value_detach(vm, value_len);
                fus_value_detach(vm, value_i);
            }else if(!strcmp(token, "str_getcode")){
                fus_value_t value_s;
                fus_value_t value_i;
                FUS_STATE_STACK_POP(&value_i)
                FUS_STATE_STACK_POP(&value_s)
                fus_value_t value_code = fus_value_str_getcode(vm,
                    value_s, value_i);
                FUS_STATE_STACK_PUSH(value_code)
                fus_value_detach(vm, value_i);
                fus_value_detach(vm, value_s);
            }else if(!strcmp(token, "str_setcode")){
                fus_value_t value_s;
                fus_value_t value_code;
                fus_value_t value_i;
                FUS_STATE_STACK_POP(&value_i)
                FUS_STATE_STACK_POP(&value_code)
                FUS_STATE_STACK_POP(&value_s)
                fus_value_str_setcode(vm, &value_s, value_code, value_i);
                FUS_STATE_STACK_PUSH(value_s)
                fus_value_detach(vm, value_i);
                fus_value_detach(vm, value_code);
            }else if(!strcmp(token, "str_tosym")){
                fus_value_t value_s;
                FUS_STATE_STACK_POP(&value_s)
                const char *text = fus_value_str_decode(vm, value_s);
                int sym_i = fus_symtable_get_or_add_from_string(
                    vm->symtable, text);
                fus_value_t value_sym = fus_value_sym(vm, sym_i);
                FUS_STATE_STACK_PUSH(value_sym)
                fus_value_detach(vm, value_s);
            }else if(!strcmp(token, "swap")){
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                FUS_STATE_STACK_PUSH(value2)
                FUS_STATE_STACK_PUSH(value1)
            }else if(!strcmp(token, "dup")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_STACK_PUSH(value)
                FUS_STATE_STACK_PUSH(value)
                fus_value_attach(vm, value);
            }else if(!strcmp(token, "drop")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_value_detach(vm, value);
            }else if(!strcmp(token, "nip")){
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                fus_value_detach(vm, value1);
                FUS_STATE_STACK_PUSH(value2)
            }else if(!strcmp(token, "over")){
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                FUS_STATE_STACK_PUSH(value1)
                FUS_STATE_STACK_PUSH(value2)
                FUS_STATE_STACK_PUSH(value1)
                fus_value_attach(vm, value1);
            }else if(!strcmp(token, "='")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                int sym_i = fus_value_sym_decode(vm, token_value);
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_obj_set(vm, vars, sym_i, value);
            }else if(!strcmp(token, "'")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                int sym_i = fus_value_sym_decode(vm, token_value);
                fus_value_t value = fus_obj_get(vm, vars, sym_i);
                fus_value_attach(vm, value);
                FUS_STATE_STACK_PUSH(value)
            }else if(!strcmp(token, "''")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                int sym_i = fus_value_sym_decode(vm, token_value);
                fus_value_t value = fus_obj_get(vm, vars, sym_i);
                fus_value_attach(vm, value);
                fus_obj_set(vm, vars, sym_i, fus_value_null(vm));
                FUS_STATE_STACK_PUSH(value)
            }else if(!strcmp(token, "assert")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                bool b = fus_value_bool_decode(vm, value);
                if(!b){
                    fprintf(stderr, "%s: Failed assertion\n", __func__);
                    goto err;
                }
            }else if(!strcmp(token, "p") || !strcmp(token, "error")){
                bool is_error = token[0] == 'e';
                if(is_error)fprintf(stderr, "%s: Error raised: ", __func__);
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_printer_t printer;
                fus_printer_init(&printer);
                fus_printer_write_value(&printer, vm, value);
                fus_printer_write_newline(&printer);
                fus_printer_flush(&printer);
                fus_printer_cleanup(&printer);
                fus_value_detach(vm, value);
                if(is_error)goto err;
            }else if(!strcmp(token, "str_p")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                if(!fus_value_is_str(value)){
                    fprintf(stderr, "%s: Not a str: %s\n", __func__,
                        fus_value_type_msg(value));
                    goto err;
                }
                fus_str_t *s = &value.p->data.s;
                fus_printer_t printer;
                fus_printer_init(&printer);
                fus_printer_write(&printer, s->text, s->len);
                fus_printer_flush(&printer);
                fus_printer_cleanup(&printer);
                fus_value_detach(vm, value);
            }else if(!strcmp(token, "def") || !strcmp(token, "fun")){
                bool got_def = token[0] == 'd';

                int def_sym_i = -1;
                if(got_def){
                    FUS_STATE_NEXT_VALUE()
                    FUS_STATE_EXPECT_T(sym)
                    def_sym_i = fus_value_sym_decode(vm, token_value);

                    if(callframe->type != FUS_CALLFRAME_TYPE_MODULE){
                        const char *token_def =
                            fus_symtable_get_token(symtable, def_sym_i);
                        fprintf(stderr, "%s: Nested defs not allowed: %s\n",
                            __func__, token_def);
                        goto err;
                    }
                }

                /* Try to parse signature, e.g. of(x -> y z) */
                fus_arr_t *sig = NULL;
                {
                    FUS_STATE_NEXT_VALUE()
                    FUS_STATE_EXPECT_T(sym)
                    int sym_i = fus_value_sym_decode(vm, token_value);
                    const char *token_of =
                        fus_symtable_get_token(symtable, sym_i);
                    if(strcmp(token_of, "of")){
                        fprintf(stderr, "%s: Unexpected sym after %s: %s\n",
                            __func__, token, token_of);
                        goto err;
                    }
                    FUS_STATE_NEXT_VALUE()
                    FUS_STATE_EXPECT_T(arr)
                    sig = &token_value.p->data.a;
                }

                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(arr)

                /* Create a function value */
                fus_value_t value_fun = fus_value_fun(vm, NULL,
                    &token_value.p->data.a, sig);

                if(got_def){
                    /* def */
                    if(fus_obj_has(vm, &runner->defs, def_sym_i)){
                        const char *token_def =
                            fus_symtable_get_token(symtable, def_sym_i);
                        fprintf(stderr, "%s: Redefinition of defs not "
                            "allowed: %s\n",
                            __func__, token_def);
                        fus_value_detach(vm, value_fun);
                        goto err;
                    }
                    fus_obj_set(vm, &runner->defs, def_sym_i, value_fun);
                }else{
                    /* fun */
                    FUS_STATE_STACK_PUSH(value_fun)
                }
            }else if(!strcmp(token, "&")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                int sym_i = fus_value_sym_decode(vm, token_value);
                const char *token_def =
                    fus_symtable_get_token(symtable, sym_i);
                fus_value_t value_fun = fus_obj_get(vm, &runner->defs, sym_i);
                FUS_STATE_STACK_PUSH(value_fun)
                fus_value_attach(vm, value_fun);
            }else if(!strcmp(token, "@")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                int sym_i = fus_value_sym_decode(vm, token_value);

                #if FUS_RUNNER_SUPER_HACKY_DEBUG_INFO
                const char *token_def =
                    fus_symtable_get_token(symtable, sym_i);
                FUS_RUNNER_SUPER_HACKY_TABS()
                printf("%s\n", token_def);
                #endif

                fus_value_t value_fun = fus_obj_get(vm, &runner->defs, sym_i);
                fus_fun_t *f = &value_fun.p->data.f;

                callframe->i = i + 1;
                fus_runner_push_callframe_fun(runner, FUS_CALLFRAME_TYPE_DEF,
                    f);
                goto dont_update_i;
            }else if(!strcmp(token, "call")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(arr)
                /* TODO: Check stack effects */

                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                if(!fus_value_is_fun(value)){
                    fprintf(stderr, "%s: Not a fun: %s\n", __func__,
                        fus_value_type_msg(value));
                    goto err;
                }
                fus_fun_t *f = &value.p->data.f;

                callframe->i = i + 1;
                fus_runner_push_callframe_fun(runner, FUS_CALLFRAME_TYPE_DEF,
                    f);

                fus_value_detach(vm, value);
                goto dont_update_i;
            }else if(!strcmp(token, "if") || !strcmp(token, "ifelse")){
                fus_arr_t *branch1 = NULL;
                fus_arr_t *branch2 = NULL;

                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(arr)
                branch1 = &token_value.p->data.a;
                if(token[2] == 'e'){
                    /* "ifelse" */
                    FUS_STATE_NEXT_VALUE()
                    FUS_STATE_EXPECT_T(arr)
                    branch2 = &token_value.p->data.a;
                }

                /* TODO: Check stack effects of the branches */

                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                bool cond = fus_value_bool_decode(vm, value);
                fus_value_detach(vm, value);
                fus_arr_t *branch_taken = cond? branch1: branch2;
                if(branch_taken != NULL){
                    callframe->i = i + 1;
                    fus_runner_push_callframe(runner, FUS_CALLFRAME_TYPE_IF,
                        branch_taken);
                    goto dont_update_i;
                }
            }else if(!strcmp(token, "do")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(arr)
                fus_arr_t *data = &token_value.p->data.a;

                callframe->i = i + 1;
                fus_runner_push_callframe(runner, FUS_CALLFRAME_TYPE_DO,
                    data);
                goto dont_update_i;
            }else if(!strcmp(token, "break") || !strcmp(token, "loop")){
                char c = token[0] == 'b'? 'b': 'l';
                    /* 'b' for break or 'l' for loop */
                if(fus_runner_break_or_loop(runner, token, c) < 0)goto err;
                goto dont_update_i;
            }else if(!strcmp(token, "while") || !strcmp(token, "until")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                bool cond = fus_value_bool_decode(vm, value);
                fus_value_detach(vm, value);

                if(token[0] == 'w')cond = !cond; /* "while" */
                if(cond){
                    if(fus_runner_break_or_loop(runner, token, 'b') < 0)goto err;
                    goto dont_update_i;
                }
            }else if(!strcmp(token, "data")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(arr)
                fus_value_t value = (fus_value_t)token_value.p;
                fus_value_attach(vm, value);
                FUS_STATE_STACK_PUSH(value)
            }else if(!strcmp(token, "ignore")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(arr)
                fus_value_t value = (fus_value_t)token_value.p;
            }else if(!strcmp(token, "dump_callframes")){
                fus_runner_dump_callframes(runner, stderr, true);
            }else if(!strcmp(token, "dump_state")){
                FUS_STATE_NEXT_VALUE()
                const char *dump_state = fus_value_str_decode(vm, token_value);
                fus_runner_dump_state(runner, stderr, dump_state);
            }else{
                fprintf(stderr, "%s: Builtin not found: %s\n",
                    __func__, token);
                goto err;
            }
        }else if(fus_value_is_arr(token_value)){
            callframe->i = i + 1;
            fus_runner_push_callframe(runner, FUS_CALLFRAME_TYPE_PAREN,
                &token_value.p->data.a);
            goto dont_update_i;
        }else{
            fprintf(stderr, "%s: Unexpected type in data to be run: %s\n",
                __func__, fus_value_type_msg(token_value));
            goto err;
        }
    }

    callframe->i = i + 1;

dont_update_i:
    /* Particularly if you push/pop a callframe, you should jump here so
    we don't attempt to access old callframe->i. */
    return 0;

err:
    fus_runner_dump_error(runner);
    return -1;
}



/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_cleanup_runner_callframe(fus_class_t *class, void *ptr){
    fus_runner_callframe_t *callframe = ptr;
    fus_runner_callframe_cleanup(callframe);
}
