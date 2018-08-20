
#include "includes.h"


int compile(fus_compiler_t *compiler, fus_lexer_t *lexer){
    int err;

    err = fus_compiler_compile_from_lexer(compiler, lexer);
    if(err)return err;

    fus_compiler_frame_t *frame = compiler->frames[0];
    printf("FRAME: %s (%i)\n", frame->name, frame->code.opcodes_len);
    fus_code_print_opcodes(&frame->code, 2);

    err = fus_code_print_opcodes_detailed(&frame->code, compiler->symtable);
    if(err)return err;

    return 0;
}

int main(int n_args, char *args[]){
    int err;

    const char *filename = "./class.fus";

    for(int i = 1; i < n_args; i++){
        char *arg = args[i];
        if(!strcmp(arg, "-f")){
            i++;
            if(i >= n_args){
                printf("Missing filename after argument: %s", arg);
                return 2;
            }
            char *arg = args[i];
            filename = arg;
        }else{
            printf("Unrecognized argument: %s\n", arg);
            return 2;
        }
    }

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
    err = compile(&compiler, &lexer);
    if(err)return err;
#endif

    fus_state_t state;
    err = fus_state_init(&state, &compiler);
    if(err)return err;


    /* Clean up */
    fus_lexer_cleanup(&lexer);
    fus_symtable_cleanup(&symtable);
    fus_compiler_cleanup(&compiler);
    fus_state_cleanup(&state);

    printf("OK!\n");
    return 0;
}

