
#include "includes.h"



int compile(fus_compiler_t *compiler, fus_lexer_t *lexer){
    int err;

    err = fus_compiler_compile_from_lexer(compiler, lexer);
    if(err)return err;

    fus_compiler_frame_t *frame = NULL;
    err = fus_compiler_get_root_frame(compiler, &frame);
    if(err)return err;

#ifdef FUS_FRAME_DEBUG
    printf("FRAME: %s (%i)\n", frame->name, frame->data.def.code.opcodes_len);
    fus_code_print_opcodes(&frame->data.def.code, 2);
#endif

    err = fus_code_print_opcodes_detailed(&frame->data.def.code, compiler->symtable);
    if(err)return err;

    return 0;
}

int run(fus_state_t *state){
    int err;
    fus_compiler_frame_t *root_frame = NULL;
    err = fus_compiler_get_root_frame(state->compiler, &root_frame);
    if(err)return err;
    fus_code_t *code = &root_frame->data.def.code;
    err = fus_state_push_frame(state, code);
    if(err)return err;
    err = fus_state_run(state);
    if(err)return err;
    return 0;
}

int main(int n_args, char *args[]){
    int err;

#ifdef FUS_DEBUG_MALLOC
    printf("MALLOC AT START:\n");
    malloc_stats();
#endif

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

#ifdef FUS_DEBUG_MALLOC
    printf("MALLOC AGAIN:\n");
    malloc_stats();
#endif

    fus_lexer_t lexer;
    err = fus_lexer_init(&lexer, buffer, filename);
    if(err)return err;

    fus_symtable_t symtable;
    err = fus_symtable_init(&symtable);
    if(err)return err;

    fus_compiler_t compiler;
    err = fus_compiler_init(&compiler, &symtable);
    if(err)return err;

    err = compile(&compiler, &lexer);
    if(err)return err;

    fus_state_t state;
    err = fus_state_init(&state, &compiler);
    if(err)return err;

    err = run(&state);
    if(err)return err;



#ifdef FUS_DEBUG_MALLOC
    printf("MALLOC BEFORE CLEANUP:\n");
    malloc_stats();
#endif

    /* Clean up */
    free(buffer);
    fus_lexer_cleanup(&lexer);
    fus_symtable_cleanup(&symtable);
    fus_compiler_cleanup(&compiler);
    fus_state_cleanup(&state);

#ifdef FUS_DEBUG_MALLOC
    printf("MALLOC AFTER CLEANUP:\n");
    malloc_stats();
#endif

    printf("OK!\n");
    return 0;
}

