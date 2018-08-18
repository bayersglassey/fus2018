
#include "includes.h"


int main(int n_args, char *args[]){
    int err;

    const char *filename = "./class.fus";
    char *buffer = load_file(filename);
    if(buffer == NULL)return 2;

    fus_lexer_t lexer;
    err = fus_lexer_init(&lexer, buffer, filename);
    if(err)return err;

    fus_symtable_t symtable;
    err = fus_symtable_init(&symtable);
    if(err)return err;

    fus_compiler_t compiler;
    err = fus_compiler_init(&compiler, &symtable);
    if(err)return err;

#if 0
    while(1){
        if(fus_lexer_done(&lexer))break;
        printf("Lexed: ");
        fus_lexer_show(&lexer, stdout);
        printf("\n");
        int err = fus_lexer_next(&lexer);
        if(err)return err;
    }
#else
    err = fus_compiler_compile_from_lexer(&compiler, &lexer);
    if(err)return err;
#endif

    fus_state_t state;
    err = fus_state_init(&state, &symtable);
    if(err)return err;


    /* Clean up */
    fus_lexer_cleanup(&lexer);
    fus_symtable_cleanup(&symtable);
    fus_compiler_cleanup(&compiler);
    fus_state_cleanup(&state);

    printf("OK!\n");
    return 0;
}

