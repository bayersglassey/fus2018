

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


void fus_state_exec_lexer(fus_state_t *state, fus_lexer_t *lexer){
    fus_vm_t *vm = state->vm;
    int arr_depth = 0;
    while(fus_lexer_is_ok(lexer)){
        fus_lexer_token_type_t type = lexer->token_type;
        if(type == FUS_TOKEN_INT){
            fus_value_t value = fus_value_tokenparse_int(vm,
                lexer->token, lexer->token_len);
            fus_arr_push(vm, &state->stack, value);
        }else if(type == FUS_TOKEN_SYM){
            if(fus_lexer_got(lexer, "`")){
                fus_lexer_next(lexer);
                if(lexer->token_type != FUS_TOKEN_SYM){
                    fus_lexer_perror(lexer, "Expected sym after \"`\"");
                    fus_lexer_set_error(lexer, FUS_LEXER_ERRCODE_IDUNNO);
                    return;
                }
                fus_value_t value = fus_value_tokenparse_sym(vm,
                    lexer->token, lexer->token_len);
                fus_arr_push(vm, &state->stack, value);
            }else if(fus_lexer_got(lexer, "+")){
                fus_value_t value1;
                fus_value_t value2;
                fus_arr_pop(vm, &state->stack, &value2);
                fus_arr_pop(vm, &state->stack, &value1);
                fus_value_t value3 = fus_value_int_add(vm,
                    value1, value2);
                fus_arr_push(vm, &state->stack, value3);
            }else if(fus_lexer_got(lexer, "*")){
                fus_value_t value1;
                fus_value_t value2;
                fus_arr_pop(vm, &state->stack, &value2);
                fus_arr_pop(vm, &state->stack, &value1);
                fus_value_t value3 = fus_value_int_mul(vm,
                    value1, value2);
                fus_arr_push(vm, &state->stack, value3);
            }else if(fus_lexer_got(lexer, "arr")){
                fus_value_t value = fus_value_arr(vm);
                fus_arr_push(vm, &state->stack, value);
            }else if(fus_lexer_got(lexer, "obj")){
                fus_value_t value = fus_value_obj(vm);
                fus_arr_push(vm, &state->stack, value);
            }else if(fus_lexer_got(lexer, ",") || fus_lexer_got(lexer, "push")){
                fus_value_t value_a;
                fus_value_t value;
                fus_arr_pop(vm, &state->stack, &value);
                fus_arr_pop(vm, &state->stack, &value_a);
                fus_value_arr_push(vm, &value_a, value);
                fus_arr_push(vm, &state->stack, value_a);
            }else if(fus_lexer_got(lexer, "=.")){

                /* I don't think we want to deal with split tokens here...
                Let's definitely wrap up the tokens in an arr, and make that
                a code_t or whatever, and have this function iterate over one
                of those, so it's guaranteed to have all its stuff, you know? */
                fprintf(stderr, "%s: TODO!\n", __func__);
                exit(EXIT_FAILURE);

                int sym_i = -1; /* TODO */
                fus_value_t value_o;
                fus_value_t value;
                fus_arr_pop(vm, &state->stack, &value);
                fus_arr_pop(vm, &state->stack, &value_o);
                fus_value_obj_set(vm, &value_o, sym_i, value);
                fus_arr_push(vm, &state->stack, value_o);
            }else if(fus_lexer_got(lexer, "len")){
                fus_value_t value;
                fus_arr_pop(vm, &state->stack, &value);
                fus_value_t value_len = fus_value_arr_len(vm, value);
                fus_arr_push(vm, &state->stack, value_len);
                fus_value_detach(vm, value);
            }else if(fus_lexer_got(lexer, "swap")){
                fus_value_t value1;
                fus_value_t value2;
                fus_arr_pop(vm, &state->stack, &value2);
                fus_arr_pop(vm, &state->stack, &value1);
                fus_arr_push(vm, &state->stack, value2);
                fus_arr_push(vm, &state->stack, value1);
            }else if(fus_lexer_got(lexer, "dup")){
                fus_value_t value;
                fus_arr_pop(vm, &state->stack, &value);
                fus_arr_push(vm, &state->stack, value);
                fus_arr_push(vm, &state->stack, value);
                fus_value_attach(vm, value);
            }else if(fus_lexer_got(lexer, "drop")){
                fus_value_t value;
                fus_arr_pop(vm, &state->stack, &value);
                fus_value_detach(vm, value);
            }else{
                fus_lexer_perror(lexer, "Builtin not found");
                fus_lexer_set_error(lexer, FUS_LEXER_ERRCODE_IDUNNO);
                return;
            }
        }else if(type == FUS_TOKEN_STR){
            fus_value_t value = fus_value_tokenparse_str(vm,
                lexer->token, lexer->token_len);
            fus_arr_push(vm, &state->stack, value);
        }else if(type == FUS_TOKEN_ARR_OPEN){
            arr_depth++;
        }else if(type == FUS_TOKEN_ARR_CLOSE){
            if(arr_depth <= 0){
                fus_lexer_perror(lexer, "Too many close parens");
                fus_lexer_set_error(lexer, FUS_LEXER_ERRCODE_IDUNNO);
                return;
            }
            arr_depth--;
        }else{
            fus_lexer_perror(lexer, "Can't exec token");
            fus_lexer_set_error(lexer, FUS_LEXER_ERRCODE_IDUNNO);
            return;
        }
        fus_lexer_next(lexer);
    }
}

