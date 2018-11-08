

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

void fus_state_init(fus_state_t *state, fus_vm_t *vm){
    state->vm = vm;
    fus_arr_init(vm, &state->stack);
    fus_obj_init(vm, &state->vars);
    fus_obj_init(vm, &state->defs);
}

void fus_state_cleanup(fus_state_t *state){
    fus_arr_cleanup(state->vm, &state->stack);
    fus_obj_cleanup(state->vm, &state->vars);
    fus_obj_cleanup(state->vm, &state->defs);
}

void fus_state_dump(fus_state_t *state, FILE *file, const char *fmt){
    fus_vm_t *vm = state->vm;

    fus_printer_t printer;
    fus_printer_init(&printer);
    fus_printer_set_file(&printer, file);
    printer.depth = 2;

    fprintf(file, "STATE:\n");
    char fmt_c;
    while(fmt_c = *fmt, fmt_c != '\0'){
        if(fmt_c == 'd'){
            fprintf(file, "  defs:\n");
            fus_printer_write_tabs(&printer);
            fus_printer_print_obj_as_data(&printer, vm, &state->defs);
            fprintf(file, "\n");
        }else if(fmt_c == 'v'){
            fprintf(file, "  vars:\n");
            fus_printer_write_tabs(&printer);
            fus_printer_print_obj(&printer, vm, &state->vars);
            fprintf(file, "\n");
        }else if(fmt_c == 's'){
            fprintf(file, "  stack:\n");
            fus_printer_write_tabs(&printer);
            fus_printer_print_arr(&printer, vm, &state->stack);
            fprintf(file, "\n");
        }else{
            fprintf(file, "  unrecognized fmt_c: %c\n", fmt_c);
        }
        fmt++;
    }

    fus_printer_cleanup(&printer);
}


int fus_state_exec_lexer(fus_state_t *state, fus_lexer_t *lexer,
    bool dump_parser
){
    int status = -1;

    fus_parser_t parser;
    fus_parser_init(&parser, state->vm);

    if(fus_parser_parse_lexer(&parser, lexer) < 0)goto err;
    if(dump_parser)fus_parser_dump(&parser, stderr);
    if(fus_state_exec_data(state, &parser.arr) < 0)goto err;

    status = 0; /* OK! */
err:
    fus_parser_cleanup(&parser);
    return status;
}

int fus_state_exec_data(fus_state_t *state, fus_arr_t *data){
    int status = -1;

    fus_runner_t runner;
    fus_runner_init(&runner, state, data);

    while(!fus_runner_is_done(&runner)){
        if(fus_runner_step(&runner) < 0)goto err;
    }

    status = 0; /* OK! */
err:
    fus_runner_cleanup(&runner);
    return status;
}



/**********
 * RUNNER *
 **********/

void fus_runner_callframe_init(fus_runner_callframe_t *callframe,
    fus_runner_t *runner,
    fus_runner_callframe_type_t type,
    fus_arr_t *data
){
    callframe->runner = runner;
    callframe->type = type;
    fus_arr_copy(runner->state->vm, &callframe->data, data);
    callframe->i = 0;
}

void fus_runner_callframe_cleanup(fus_runner_callframe_t *callframe){
    fus_arr_cleanup(callframe->runner->state->vm, &callframe->data);
}

void fus_runner_init(fus_runner_t *runner, fus_state_t *state,
    fus_arr_t *data
){
    runner->state = state;

    /* Init callframe class */
    fus_vm_t *vm = state->vm;
    fus_class_init(&runner->class_callframe, vm->core,
        "runner_callframe", sizeof(fus_runner_callframe_t), runner,
        fus_class_instance_init_zero,
        fus_class_cleanup_runner_callframe);

    /* Init callframe array */
    fus_array_init(&runner->callframes, &runner->class_callframe);
    fus_runner_push_callframe(runner, FUS_CALLFRAME_TYPE_MODULE, data);
}

void fus_runner_cleanup(fus_runner_t *runner){
    fus_array_cleanup(&runner->callframes);
}



fus_runner_callframe_t *fus_runner_get_callframe(fus_runner_t *runner){
    int callframes_len = runner->callframes.len;
    if(callframes_len <= 0)return NULL;
    return FUS_ARRAY_GET_REF(runner->callframes, callframes_len - 1);
}

bool fus_runner_is_done(fus_runner_t *runner){
    fus_runner_callframe_t *callframe = fus_runner_get_callframe(runner);
    return callframe == NULL;
}

void fus_runner_push_callframe(fus_runner_t *runner,
    fus_runner_callframe_type_t type,
    fus_arr_t *data
){
    fus_array_push(&runner->callframes);
    fus_runner_callframe_t *callframe = fus_runner_get_callframe(runner);
    fus_runner_callframe_init(callframe, runner, type, data);
}

void fus_runner_pop_callframe(fus_runner_t *runner){
    fus_runner_callframe_t *callframe = fus_runner_get_callframe(runner);
    fus_runner_callframe_cleanup(callframe);
    fus_array_pop(&runner->callframes);
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
    fus_arr_t *data = &callframe->data;
    int i = callframe->i;
    fus_value_t *token_values = FUS_ARR_VALUES(*data);
    int token_values_len = data->values.len;
    if(i >= token_values_len){
        /* Pop callframe if we've reached end of data.
        Doing so counts as a complete step. */
        fus_runner_pop_callframe(runner);
        return 0;
    }
    fus_value_t token_value = token_values[i];

    /* Get some variables from state */
    fus_state_t *state = runner->state;
    fus_vm_t *vm = state->vm;
    fus_symtable_t *symtable = vm->symtable;

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
                int __sym_i = fus_value_sym_decode(token_value); \
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
            if(fus_arr_pop(vm, &state->stack, (VPTR)))goto err;

        #if FUS_RUNNER_SUPER_HACKY_DEBUG_INFO
        if(!fus_value_is_sym(token_value)){
            FUS_RUNNER_SUPER_HACKY_TABS()
            printf("%s\n", fus_value_type_msg(token_value));
        }
        #endif

        if(fus_value_is_int(token_value) || fus_value_is_str(token_value)){
            fus_value_attach(vm, token_value);
            fus_arr_push(vm, &state->stack, token_value);
        }else if(fus_value_is_sym(token_value)){
            int sym_i = fus_value_sym_decode(token_value);
            const char *token = fus_symtable_get_token(symtable, sym_i);

            #if FUS_RUNNER_SUPER_HACKY_DEBUG_INFO
            FUS_RUNNER_SUPER_HACKY_TABS()
            printf("%s\n", token);
            #endif

            if(!strcmp(token, "`")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                fus_value_t value = fus_value_stringparse_sym(vm, token);
                fus_arr_push(vm, &state->stack, value);
            }else if(!strcmp(token, "null")){
                fus_value_t value = fus_value_null(vm);
                fus_arr_push(vm, &state->stack, value);
            }else if(!strcmp(token, "T")){
                fus_value_t value = fus_value_bool(vm, true);
                fus_arr_push(vm, &state->stack, value);
            }else if(!strcmp(token, "F")){
                fus_value_t value = fus_value_bool(vm, false);
                fus_arr_push(vm, &state->stack, value);
            }else if(!strcmp(token, "not")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_value_t new_value = fus_value_bool_not(vm, value);
                fus_arr_push(vm, &state->stack, new_value);
            }else if(!strcmp(token, "neg")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_value_t new_value = fus_value_int_neg(vm, value);
                fus_arr_push(vm, &state->stack, new_value);

            #define FUS_RUNNER_INT_BINOP(TOK, OP) \
            }else if(!strcmp(token, TOK)) { \
                fus_value_t value1; \
                fus_value_t value2; \
                FUS_STATE_STACK_POP(&value2) \
                FUS_STATE_STACK_POP(&value1) \
                fus_value_t value3 = fus_value_int_##OP(vm, \
                    value1, value2); \
                fus_arr_push(vm, &state->stack, value3); \

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

            }else if(!strcmp(token, "eq")){
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                fus_value_t value3 = fus_value_eq(vm,
                    value1, value2);
                fus_arr_push(vm, &state->stack, value3);
            }else if(!strcmp(token, "arr")){
                fus_value_t value = fus_value_arr(vm);
                fus_arr_push(vm, &state->stack, value);
            }else if(!strcmp(token, "obj")){
                fus_value_t value = fus_value_obj(vm);
                fus_arr_push(vm, &state->stack, value);
            }else if(!strcmp(token, ",") || !strcmp(token, "push")){
                fus_value_t value_a;
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_STACK_POP(&value_a)
                fus_value_arr_push(vm, &value_a, value);
                fus_arr_push(vm, &state->stack, value_a);
            }else if(!strcmp(token, "pop")){
                fus_value_t value_a;
                fus_value_t value;
                FUS_STATE_STACK_POP(&value_a)
                fus_value_arr_pop(vm, &value_a, &value);
                fus_arr_push(vm, &state->stack, value_a);
                fus_arr_push(vm, &state->stack, value);
            }else if(!strcmp(token, ".$")){
                fus_value_t value_a;
                fus_value_t value_i;
                FUS_STATE_STACK_POP(&value_i)
                FUS_STATE_STACK_POP(&value_a)
                fus_value_t value = fus_value_arr_get(vm, value_a, value_i);
                fus_value_attach(vm, value);
                fus_arr_push(vm, &state->stack, value);
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

                fus_arr_push(vm, &state->stack, value_a);
                fus_arr_push(vm, &state->stack, value);
                fus_value_detach(vm, value_i);
            }else if(!strcmp(token, "=.")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                int sym_i = fus_value_sym_decode(token_value);
                fus_value_t value_o;
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_STACK_POP(&value_o)
                fus_value_obj_set(vm, &value_o, sym_i, value);
                fus_arr_push(vm, &state->stack, value_o);
            }else if(!strcmp(token, ".")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                int sym_i = fus_value_sym_decode(token_value);
                fus_value_t value_o;
                FUS_STATE_STACK_POP(&value_o)
                fus_value_t value = fus_value_obj_get(vm, value_o, sym_i);
                fus_value_attach(vm, value);
                fus_arr_push(vm, &state->stack, value);
                fus_value_detach(vm, value_o);
            }else if(!strcmp(token, "..")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                int sym_i = fus_value_sym_decode(token_value);
                fus_value_t value_o;
                FUS_STATE_STACK_POP(&value_o)
                fus_value_t value = fus_value_obj_get(vm, value_o, sym_i);
                fus_value_attach(vm, value);
                fus_value_obj_set(vm, &value_o, sym_i, fus_value_null(vm));
                fus_arr_push(vm, &state->stack, value_o);
                fus_arr_push(vm, &state->stack, value);
            }else if(!strcmp(token, "len")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_value_t value_len = fus_value_arr_len(vm, value);
                fus_arr_push(vm, &state->stack, value_len);
                fus_value_detach(vm, value);
            }else if(!strcmp(token, "swap")){
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                fus_arr_push(vm, &state->stack, value2);
                fus_arr_push(vm, &state->stack, value1);
            }else if(!strcmp(token, "dup")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_arr_push(vm, &state->stack, value);
                fus_arr_push(vm, &state->stack, value);
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
                fus_arr_push(vm, &state->stack, value2);
            }else if(!strcmp(token, "over")){
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                fus_arr_push(vm, &state->stack, value1);
                fus_arr_push(vm, &state->stack, value2);
                fus_arr_push(vm, &state->stack, value1);
                fus_value_attach(vm, value1);
            }else if(!strcmp(token, "='")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                int sym_i = fus_value_sym_decode(token_value);
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_obj_set(vm, &state->vars, sym_i, value);
            }else if(!strcmp(token, "'")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                int sym_i = fus_value_sym_decode(token_value);
                fus_value_t value = fus_obj_get(vm, &state->vars, sym_i);
                fus_value_attach(vm, value);
                fus_arr_push(vm, &state->stack, value);
            }else if(!strcmp(token, "''")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                int sym_i = fus_value_sym_decode(token_value);
                fus_value_t value = fus_obj_get(vm, &state->vars, sym_i);
                fus_value_attach(vm, value);
                fus_obj_set(vm, &state->vars, sym_i, fus_value_null(vm));
                fus_arr_push(vm, &state->stack, value);
            }else if(!strcmp(token, "assert")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                bool b = fus_value_bool_decode(value);
                if(!b){
                    fprintf(stderr, "%s: Failed assertion\n", __func__);
                    goto err;
                }
            }else if(!strcmp(token, "p")){
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                fus_printer_t printer;
                fus_printer_init(&printer);
                fus_printer_write_value(&printer, vm, value);
                fus_printer_write_newline(&printer);
                fus_printer_flush(&printer);
                fus_printer_cleanup(&printer);
                fus_value_detach(vm, value);
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
                    def_sym_i = fus_value_sym_decode(token_value);

                    if(callframe->type != FUS_CALLFRAME_TYPE_MODULE){
                        const char *token_def =
                            fus_symtable_get_token(symtable, def_sym_i);
                        fprintf(stderr, "%s: Nested defs not allowed: %s\n",
                            __func__, token_def);
                        goto err;
                    }
                }

                fus_value_t value_peek;
                FUS_STATE_PEEK_NEXT_VALUE(value_peek)
                if(fus_value_is_sym(value_peek)){
                    int sym_i = fus_value_sym_decode(value_peek);
                    const char *token_peek =
                        fus_symtable_get_token(symtable, sym_i);
                    if(strcmp(token_peek, "of")){
                        fprintf(stderr, "%s: Unexpected sym after %s: %s\n",
                            __func__, token, token_peek);
                        goto err;
                    }
                    FUS_STATE_NEXT_VALUE()
                    FUS_STATE_NEXT_VALUE()
                    FUS_STATE_EXPECT_T(arr)
                    /* TODO: Check stack effects */
                }

                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(arr)

                if(got_def){
                    /* def */
                    fus_obj_set(vm, &state->defs, def_sym_i, token_value);
                    fus_value_attach(vm, token_value);
                }else{
                    /* fun */
                    fus_value_t value_fun = fus_value_fun(vm, NULL,
                        &token_value.p->data.a);
                    fus_arr_push(vm, &state->stack, value_fun);
                }
            }else if(!strcmp(token, "@")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                int sym_i = fus_value_sym_decode(token_value);

                #if FUS_RUNNER_SUPER_HACKY_DEBUG_INFO
                const char *token_def =
                    fus_symtable_get_token(symtable, sym_i);
                FUS_RUNNER_SUPER_HACKY_TABS()
                printf("%s\n", token_def);
                #endif

                fus_value_t value_def = fus_obj_get(vm, &state->defs, sym_i);
                fus_arr_t *def_data = &value_def.p->data.a;

                callframe->i = i + 1;
                fus_runner_push_callframe(runner, FUS_CALLFRAME_TYPE_DEF,
                    def_data);
                goto dont_update_i;
            }else if(!strcmp(token, "&")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                int sym_i = fus_value_sym_decode(token_value);
                const char *token_def =
                    fus_symtable_get_token(symtable, sym_i);
                fus_value_t value_def = fus_obj_get(vm, &state->defs, sym_i);
                fus_arr_t *def_data = &value_def.p->data.a;
                fus_value_t value_fun = fus_value_fun(vm,
                    fus_strdup(vm->core, token_def), def_data);
                fus_arr_push(vm, &state->stack, value_fun);
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
                fus_arr_t *data = &f->data;

                callframe->i = i + 1;
                fus_runner_push_callframe(runner, FUS_CALLFRAME_TYPE_IF,
                    data);

                fus_value_detach(vm, value);
                goto dont_update_i;
            }else if(!strcmp(token, "if") || !strcmp(token, "ifelse")){
                fus_arr_t *branch1 = NULL;
                fus_arr_t *branch2 = NULL;

                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(arr)
                branch1 = &token_value.p->data.a;
                if(token[2] != '\0'){
                    /* "ifelse" */
                    FUS_STATE_NEXT_VALUE()
                    FUS_STATE_EXPECT_T(arr)
                    branch2 = &token_value.p->data.a;
                }

                /* TODO: Check stack effects of the branches */

                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                bool cond = fus_value_bool_decode(value);
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
                bool cond = fus_value_bool_decode(value);
                fus_value_detach(vm, value);

                if(token[0] == 'w')cond = !cond; /* "while" */
                if(cond){
                    if(fus_runner_break_or_loop(runner, token, 'b') < 0)goto err;
                    goto dont_update_i;
                }
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
    /* TODO: Improve the following greatly...
    Can we wrap it up as a callback somehow, so we can tell core to call
    it before exiting?
    So, have a stack of on_error callbacks on core??? Oh my goodness */
    callframe = fus_runner_get_callframe(runner);
    if(callframe != NULL){
        fus_arr_t *data = &callframe->data;
        fus_printer_t printer;
        fus_printer_init(&printer);
        fus_printer_print_data(&printer, vm, data, 0, -1);
        fprintf(stderr, "\n");
        fus_printer_cleanup(&printer);
    }
    return -1;
}



/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_cleanup_runner_callframe(fus_class_t *class, void *ptr){
    fus_runner_callframe_t *callframe = ptr;
    fus_runner_callframe_cleanup(callframe);
}
