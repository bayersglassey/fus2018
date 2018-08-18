
#include "includes.h"




void fus_compiler_frame_cleanup(fus_compiler_frame_t *frame){
    free(frame->name);
    fus_code_cleanup(&frame->code);
}

int fus_compiler_frame_init(fus_compiler_frame_t *frame,
    fus_compiler_frame_t *parent, const char *name
){
    int err;
    frame->parent = parent;
    frame->depth = parent == NULL? 0: parent->depth + 1;
    frame->name = strdup(name);
    if(frame->name == NULL)return 1;
    err = fus_code_init(&frame->code);
    if(err)return err;
    return 0;
}



void fus_compiler_cleanup(fus_compiler_t *compiler){
    ARRAY_FREE(fus_compiler_frame_t, compiler->frames,
        fus_compiler_frame_cleanup)
}

int fus_compiler_init(fus_compiler_t *compiler, fus_symtable_t *symtable){
    compiler->cur_frame = NULL;
    ARRAY_INIT(compiler->frames)
    return 0;
}

int fus_compiler_push_frame(fus_compiler_t *compiler, const char *name){
    int err;
    fus_compiler_frame_t *new_frame = malloc(sizeof(*new_frame));
    if(new_frame == NULL)return 1;
    err = fus_compiler_frame_init(new_frame, compiler->cur_frame, name);
    if(err)return err;
    compiler->cur_frame = new_frame;
    return 0;
}

int fus_compiler_pop_frame(fus_compiler_t *compiler){
    if(compiler->cur_frame == NULL){
        ERR_INFO();
        fprintf(stderr, "No frame to pop\n");
        return 2;
    }
    compiler->cur_frame = compiler->cur_frame->parent;
    return 0;
}


static int fus_compiler_compile_frame_from_lexer(fus_compiler_t *compiler,
    fus_lexer_t *lexer, const char *name, int depth
){
    int err;
    err = fus_compiler_push_frame(compiler, name);
    if(err)return err;

    for(int i = 0; i < depth; i++)printf("  ");
    printf("Compiling frame: %s\n", compiler->cur_frame->name);

    int block_depth = 0;
    while(1){
        if(fus_lexer_done(lexer)){
            break;
        }else if(fus_lexer_got(lexer, ")")){
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Done. depth=%i, block_depth=%i\n", depth, block_depth);
            if(block_depth <= 0)break;
            err = fus_lexer_next(lexer);
            if(err)return err;
            block_depth--;
            depth--;
        }else if(fus_lexer_got(lexer, "def")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            char *def_name = NULL;
            err = fus_lexer_get_name(lexer, &def_name);
            if(err)return err;
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Def: %s\n", def_name);
            err = fus_lexer_get(lexer, "(");
            if(err)return err;
            err = fus_compiler_compile_frame_from_lexer(
                compiler, lexer, def_name, depth + 1);
            if(err)return err;
            err = fus_lexer_get(lexer, ")");
            if(err)return err;
            free(def_name);
        }else if(fus_lexer_got(lexer, "(")){
            int err = fus_lexer_next(lexer);
            if(err)return err;
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Block:\n");
            block_depth++;
            depth++;
        }else{
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Lexed: ");
            fus_lexer_show(lexer, stdout);
            printf("\n");
            int err = fus_lexer_next(lexer);
            if(err)return err;
        }

    }
    err = fus_compiler_pop_frame(compiler);
    if(err)return err;
    return 0;
}

int fus_compiler_compile_from_lexer(fus_compiler_t *compiler,
    fus_lexer_t *lexer
){
    int err;
    err = fus_compiler_compile_frame_from_lexer(compiler, lexer,
        lexer->filename, 0);
    if(err)return err;
    return 0;
}

