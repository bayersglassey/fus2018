

#include "../includes.h"


typedef struct fus_state {
    fus_vm_t *vm;
    fus_arr_t stack;
    //fus_obj_t vars;
} fus_state_t;

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
            fus_value_t value = fus_value_tokenparse_sym(state->vm,
                lexer->token, lexer->token_len);
            fus_arr_push(&state->stack, value);
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


static int run(fus_t *fus, const char *filename, const char *text){
    fus_lexer_t *lexer = &fus->lexer;
    fus_lexer_reset(lexer, fus_strdup(&fus->core, filename));
    fus_lexer_load_chunk(lexer, text, strlen(text) + 1);

    {
        fus_state_t state;
        fus_state_init(&state, &fus->vm);

        exec(lexer, &state);
        fus_printer_print_data(&fus->printer, &fus->vm, &state.stack);

        fus_state_cleanup(&state);
    }

    if(!fus_lexer_is_done(lexer)){
        fprintf(stderr, "%s: Lexer finished with unexpected state: %s\n",
            __func__, fus_lexer_token_type_msg(lexer->token_type));
        fus_lexer_perror(lexer, "Oh no!");
        return EXIT_FAILURE;
    }

    return EXIT_SUCCESS;
}

int main(int n_args, char *args[]){
    if(n_args < 2){
        fprintf(stderr, "Usage: %s FILE\n", args[0]);
        fprintf(stderr, "Parses the file as fus data and runs it.\n");
        return EXIT_FAILURE;
    }

    char *buffer = NULL;
    const char *filename = args[1];
    char *text = NULL;
    if(!strcmp(filename, "-")){
        filename = "<stdin>";
        /* TODO */
        //text = stdin;
        text = "TODO 123 lalaa\nasdz.";
    }else{
        buffer = load_file(filename);
        if(buffer == NULL)return EXIT_FAILURE;
        text = buffer;
    }

    fus_t fus;
    fus_init(&fus);
    fus.printer.file = stderr;

    int status = run(&fus, filename, text);

    fus_cleanup(&fus);
    free(buffer);
    return status;
}
