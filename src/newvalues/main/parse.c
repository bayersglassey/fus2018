
#include "../includes.h"

int parse(fus_t *fus, const char *filename, const char *text){
    fus_lexer_t *lexer = &fus->lexer;
    fus_lexer_reset(lexer, fus_strdup(&fus->core, filename));
    fus_lexer_load_chunk(lexer, text, strlen(text) + 1);

    int i = 0;
    int row = lexer->row;
    while(fus_lexer_is_ok(lexer)){
        if(lexer->row > row){
            printf("\n");
            for(int i = 0; i < lexer->indent; i++)printf(" ");
            row = lexer->row;
        }else if(i > 0)printf(" ");
        fus_lexer_print_token(lexer, stdout, false);
        fus_lexer_next(lexer);
        i++;
    }
    printf("\n");

    return EXIT_SUCCESS;
}

int main(int n_args, char *args[]){
    if(n_args < 2){
        fprintf(stderr, "Usage: %s FILE\n", args[0]);
        fprintf(stderr, "Parses the file as fus data and prints formatted "
            "version to stdout.\n");
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

    int status = parse(&fus, filename, text);

    fus_cleanup(&fus);
    free(buffer);
    fprintf(stderr, "OK\n");
    return status;
}
