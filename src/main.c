
#include "includes.h"


int compile(fus_compiler_t *compiler, fus_lexer_t *lexer){
    int err;

    fus_symtable_t *symtable = compiler->symtable;

    err = fus_compiler_compile_from_lexer(compiler, lexer);
    if(err)return err;
    fus_compiler_frame_t *frame = compiler->frames[0];

    printf("FRAME: %s (%i)\n", frame->name, frame->code.opcodes_len);
    for(int i = 0; i < frame->code.opcodes_len; i++){
        fus_opcode_t opcode = frame->code.opcodes[i];
        fus_sym_t *opcode_sym = fus_symtable_get(symtable, opcode);
        if(opcode_sym == NULL){
            ERR_INFO();
            fprintf(stderr, "Could not find sym for opcode %i\n", opcode);
            return 2;
        }else if(opcode_sym->argtype == FUS_SYMCODE_ARGTYPE_INT){
            int *ii_ptr = (int*)&frame->code.opcodes[i + 1];
            int ii = *ii_ptr;
            printf("OPCODE %i: %i (%s %i)\n", i, opcode,
                opcode_sym->token, ii);
            int n = sizeof(int) / sizeof(fus_opcode_t);
            i += n;
        }else if(opcode_sym->argtype == FUS_SYMCODE_ARGTYPE_SYM){
            int *sym_i_ptr = (int*)&frame->code.opcodes[i + 1];
            int sym_i = *sym_i_ptr;
            fus_sym_t *sym = fus_symtable_get(symtable, sym_i);
            if(sym == NULL){
                ERR_INFO();
                fprintf(stderr,
                    "After opcode %i (%s): could not find sym %i\n",
                    opcode, opcode_sym->token, sym_i);
                return 2;
            }
            printf("OPCODE %i: %i (%s %s)\n", i, opcode,
                opcode_sym->token, sym->token);
            int n = sizeof(int) / sizeof(fus_opcode_t);
            i += n;
        }else if(opcode_sym->argtype == FUS_SYMCODE_ARGTYPE_NONE){
            printf("OPCODE %i: %i (%s)\n", i, opcode, opcode_sym->token);
        }else{
            ERR_INFO();
            fprintf(stderr, "Opcode %i corresponds to a sym which is "
                "not a standard opcode type: %s\n",
                opcode, opcode_sym->token);
            return 2;
        }
    }

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

