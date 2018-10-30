

#include "../includes.h"



static int run(fus_t *fus, const char *filename, const char *text){
    int status = EXIT_SUCCESS;

    fus_lexer_t *lexer = &fus->lexer;
    fus_lexer_reset(lexer, fus_strdup(&fus->core, filename));
    fus_lexer_load_chunk(lexer, text, strlen(text) + 1);

    fus_state_t *state = &fus->state;
    fus_state_exec_lexer(state, lexer);
    fus_printer_print_arr(&fus->printer, &fus->vm, &state->stack);
    printf("\n");

    if(!fus_lexer_is_done(lexer)){
        fus_lexer_perror(lexer, "Lexer finished with status != done");
        status = EXIT_FAILURE;
    }

    return status;
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
    fus_printer_set_file(&fus.printer, stderr);

    int status = run(&fus, filename, text);

    fus_cleanup(&fus);
    free(buffer);
    return status;
}
