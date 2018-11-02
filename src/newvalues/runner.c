

#include "includes.h"



void fus_state_init(fus_state_t *state, fus_vm_t *vm){
    state->vm = vm;
    fus_arr_init(vm, &state->stack);
    fus_obj_init(vm, &state->vars);
}

void fus_state_cleanup(fus_state_t *state){
    fus_arr_cleanup(state->vm, &state->stack);
    fus_obj_cleanup(state->vm, &state->vars);
}

void fus_state_dump(fus_state_t *state, FILE *file){
    fus_vm_t *vm = state->vm;

    fus_printer_t printer;
    fus_printer_init(&printer);
    fus_printer_set_file(&printer, file);
    printer.depth = 2;

    fprintf(file, "STATE:\n");
    fprintf(file, "  vars:\n");
    fus_printer_write_tabs(&printer);
    fus_printer_print_obj(&printer, vm, &state->vars);
    fprintf(file, "\n");

    fprintf(file, "  stack:\n");
    fus_printer_write_tabs(&printer);
    fus_printer_print_arr(&printer, vm, &state->stack);
    fprintf(file, "\n");

    fus_printer_cleanup(&printer);
}


int fus_state_exec_lexer(fus_state_t *state, fus_lexer_t *lexer){
    int status = -1;

    fus_parser_t parser;
    fus_parser_init(&parser, state->vm);

    if(fus_parser_parse_lexer(&parser, lexer) < 0)goto err;
    fus_parser_dump(&parser, stderr);
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
                fprintf(stderr, "%s: Missing arg after: %s\n", \
                    __func__, token); \
                return -1; \
            } \
            token_value = token_values[i];

        #define FUS_STATE_EXPECT(T) \
            if(!fus_value_is_##T(token_value)){ \
                fprintf(stderr, "%s: Expected " #T " after: %s\n", \
                    __func__, token); \
                return -1; \
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
                FUS_STATE_EXPECT(sym)
                fus_value_t value = fus_value_stringparse_sym(vm, token);
                fus_arr_push(vm, &state->stack, value);
            }else if(!strcmp(token, "+")){
                fus_value_t value1;
                fus_value_t value2;
                FUS_STATE_STACK_POP(&value2)
                FUS_STATE_STACK_POP(&value1)
                fus_value_t value3 = fus_value_int_add(vm,
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
            }else if(!strcmp(token, "=.")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT(sym)
                int sym_i = fus_value_sym_decode(token_value);
                fus_value_t value_o;
                fus_value_t value;
                FUS_STATE_STACK_POP(&value)
                FUS_STATE_STACK_POP(&value_o)
                fus_value_obj_set(vm, &value_o, sym_i, value);
                fus_arr_push(vm, &state->stack, value_o);
            }else if(!strcmp(token, ".")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT(sym)
                int sym_i = fus_value_sym_decode(token_value);
                fus_value_t value_o;
                FUS_STATE_STACK_POP(&value_o)
                fus_value_t value = fus_value_obj_get(vm, value_o, sym_i);
                fus_value_attach(vm, value);
                fus_arr_push(vm, &state->stack, value);
                fus_value_detach(vm, value_o);
            }else if(!strcmp(token, "..")){
                FUS_STATE_NEXT_VALUE()
                FUS_STATE_EXPECT(sym)
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

