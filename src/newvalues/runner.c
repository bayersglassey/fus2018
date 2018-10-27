

#include "includes.h"



void fus_state_init(fus_state_t *state, fus_vm_t *vm){
    state->vm = vm;
    fus_arr_init(&state->stack, vm);
    //fus_obj_init(&state->vars, vm);
}

void fus_state_cleanup(fus_state_t *state){
    fus_arr_cleanup(&state->stack);
    //fus_obj_cleanup(&state->vars);
}


static void exec(fus_lexer_t *lexer, fus_state_t *state){
    int arr_depth = 0;
    while(fus_lexer_is_ok(lexer)){
        fus_lexer_token_type_t type = lexer->token_type;
        if(type == FUS_TOKEN_INT){
            fus_value_t value = fus_value_tokenparse_int(state->vm,
                lexer->token, lexer->token_len);
            fus_arr_push(&state->stack, value);
        }else if(type == FUS_TOKEN_SYM){
            if(fus_lexer_got(lexer, "`")){
                fus_lexer_next(lexer);
                if(lexer->token_type != FUS_TOKEN_SYM){
                    fus_lexer_perror(lexer, "Expected sym after \"`\"");
                    fus_lexer_set_error(lexer, FUS_LEXER_ERRCODE_IDUNNO);
                    return;
                }
                fus_value_t value = fus_value_tokenparse_sym(state->vm,
                    lexer->token, lexer->token_len);
                fus_arr_push(&state->stack, value);
            }else if(fus_lexer_got(lexer, "+")){
                fus_value_t value1;
                fus_value_t value2;
                fus_arr_pop(&state->stack, &value2);
                fus_arr_pop(&state->stack, &value1);
                fus_value_t value3 = fus_value_int_add(state->vm,
                    value1, value2);
                fus_arr_push(&state->stack, value3);
            }else if(fus_lexer_got(lexer, "*")){
                fus_value_t value1;
                fus_value_t value2;
                fus_arr_pop(&state->stack, &value2);
                fus_arr_pop(&state->stack, &value1);
                fus_value_t value3 = fus_value_int_mul(state->vm,
                    value1, value2);
                fus_arr_push(&state->stack, value3);
            }else if(fus_lexer_got(lexer, "arr")){
                fus_value_t value = fus_value_arr(state->vm);
                fus_arr_push(&state->stack, value);
            }else if(fus_lexer_got(lexer, ",") || fus_lexer_got(lexer, "push")){
                fus_value_t value1;
                fus_value_t value2;
                fus_arr_pop(&state->stack, &value2);
                fus_arr_pop(&state->stack, &value1);
                fus_value_arr_push(state->vm, &value1, value2);
                fus_arr_push(&state->stack, value1);
            }else if(fus_lexer_got(lexer, "len")){
                fus_value_t value;
                fus_arr_pop(&state->stack, &value);
                fus_value_t value_len = fus_value_arr_len(state->vm, value);
                fus_arr_push(&state->stack, value_len);
                fus_value_detach(state->vm, value);
            }else if(fus_lexer_got(lexer, "swap")){
                fus_value_t value1;
                fus_value_t value2;
                fus_arr_pop(&state->stack, &value2);
                fus_arr_pop(&state->stack, &value1);
                fus_arr_push(&state->stack, value2);
                fus_arr_push(&state->stack, value1);
            }else if(fus_lexer_got(lexer, "dup")){
                fus_value_t value;
                fus_arr_pop(&state->stack, &value);
                fus_arr_push(&state->stack, value);
                fus_arr_push(&state->stack, value);
                fus_value_attach(state->vm, value);
            }else if(fus_lexer_got(lexer, "drop")){
                fus_value_t value;
                fus_arr_pop(&state->stack, &value);
                fus_value_detach(state->vm, value);
            }else{
                fus_lexer_perror(lexer, "Builtin not found");
                fus_lexer_set_error(lexer, FUS_LEXER_ERRCODE_IDUNNO);
                return;
            }
        }else if(type == FUS_TOKEN_STR){
            fus_value_t value = fus_value_tokenparse_str(state->vm,
                lexer->token, lexer->token_len);
            fus_arr_push(&state->stack, value);
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


int fus_run_text(fus_t *fus, const char *filename, const char *text){
    int status = EXIT_SUCCESS;

    fus_lexer_t *lexer = &fus->lexer;
    fus_lexer_reset(lexer, fus_strdup(&fus->core, filename));
    fus_lexer_load_chunk(lexer, text, strlen(text) + 1);

    fus_state_t state;
    fus_state_init(&state, &fus->vm);

    exec(lexer, &state);
    fus_printer_print_arr(&fus->printer, &fus->vm, &state.stack);
    printf("\n");

    if(!fus_lexer_is_done(lexer)){
        fus_lexer_perror(lexer, "Lexer finished with status != done");
        status = EXIT_FAILURE;
    }

    fus_state_cleanup(&state);
    return status;
}

