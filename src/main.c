
#include "includes.h"


int main(int n_args, char *args[]){
    int err;

    char *buffer = load_file("./class.fus");
    if(buffer == NULL)return 2;

    fus_lexer_t lexer;
    err = fus_lexer_init(&lexer, buffer, __FILE__);
    if(err)return err;

    while(1){
        if(fus_lexer_done(&lexer))break;
        printf("Lexed: ");
        fus_lexer_show(&lexer, stdout);
        printf("\n");
        int err = fus_lexer_next(&lexer);
        if(err)return err;
    }

    fus_symtable_t symtable;
    err = fus_symtable_init(&symtable);
    if(err)return err;

    fus_state_t state;
    err = fus_state_init(&state, &symtable);
    if(err)return err;

    return 0;
}

