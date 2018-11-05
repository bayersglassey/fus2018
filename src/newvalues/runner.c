

#include "includes.h"



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
    fus_vm_t *vm = state->vm;
    fus_symtable_t *symtable = vm->symtable;
    int arr_depth = 0;
    fus_value_t *token_values = FUS_ARR_VALUES(*data);
    int token_values_len = data->values.len;
    for(int i = 0; i < token_values_len; i++){
        fus_value_t token_value = token_values[i];

        #define FUS_STATE_NEXT_VALUE() \
            i++; \
            if(i >= token_values_len){ \
                fprintf(stderr, "%s: Missing arg after %s\n", \
                    __func__, token); \
                return -1; \
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
                return -1; \
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
                    return -1; \
                } \
            }

        #define FUS_STATE_STACK_POP(VPTR) \
            if(fus_arr_pop(vm, &state->stack, (VPTR)))return -1;

        if(fus_value_is_int(token_value) || fus_value_is_str(token_value)){
            fus_value_attach(vm, token_value);
            fus_arr_push(vm, &state->stack, token_value);
        }else if(fus_value_is_sym(token_value)){
            int sym_i = fus_value_sym_decode(token_value);
            const char *token = fus_symtable_get_token(symtable, sym_i);
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
            }else if(!strcmp(token, "+")){
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                fus_value_t value3 = fus_value_int_add(vm,
                    value1, value2);
                fus_arr_push(vm, &state->stack, value3);
            }else if(!strcmp(token, "-")){
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                fus_value_t value3 = fus_value_int_sub(vm,
                    value1, value2);
                fus_arr_push(vm, &state->stack, value3);
            }else if(!strcmp(token, "*")){
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                fus_value_t value3 = fus_value_int_mul(vm,
                    value1, value2);
                fus_arr_push(vm, &state->stack, value3);
            }else if(!strcmp(token, "==")){
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                fus_value_t value3 = fus_value_int_eq(vm,
                    value1, value2);
                fus_arr_push(vm, &state->stack, value3);
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
                    return -1;
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
                    return -1;
                }
                fus_str_t *s = &value.p->data.s;
                fus_printer_t printer;
                fus_printer_init(&printer);
                fus_printer_write(&printer, s->text, s->len);
                fus_printer_flush(&printer);
                fus_printer_cleanup(&printer);
                fus_value_detach(vm, value);
            }else if(!strcmp(token, "def")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(sym)
                int sym_i = fus_value_sym_decode(token_value);

                fus_value_t value_peek;
                FUS_STATE_PEEK_NEXT_VALUE(value_peek)
                if(fus_value_is_sym(value_peek)){
                    int sym_i = fus_value_sym_decode(value_peek);
                    const char *token_peek =
                        fus_symtable_get_token(symtable, sym_i);
                    if(strcmp(token_peek, "of")){
                        fprintf(stderr, "%s: Unexpected sym after %s: %s\n",
                            __func__, token, token_peek);
                        return -1;
                    }
                    FUS_STATE_NEXT_VALUE()
                    FUS_STATE_NEXT_VALUE()
                    FUS_STATE_EXPECT_T(arr)
                }

                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT_T(arr)
                fus_obj_set(vm, &state->defs, sym_i, token_value);
                fus_value_attach(vm, token_value);
            }else{
                fprintf(stderr, "%s: Builtin not found: %s\n",
                    __func__, token);
                return -1;
            }
        }else if(fus_value_is_arr(token_value)){
            if(fus_state_exec_data(state, &token_value.p->data.a))return -1;
        }else{
            fprintf(stderr, "%s: Unexpected type in data to be run: %s\n",
                __func__, fus_value_type_msg(token_value));
            return -1;
        }
    }
    return 0;
}

