
#include "includes.h"




void fus_compiler_frame_cleanup(fus_compiler_frame_t *frame){
    free(frame->name);
    fus_code_cleanup(&frame->code);
}

int fus_compiler_frame_init(fus_compiler_frame_t *frame,
    fus_compiler_frame_t *parent, char *name,
    fus_signature_t *sig
){
    int err;
    frame->parent = parent;
    frame->depth = parent == NULL? 0: parent->depth + 1;
    frame->name = name;
    if(frame->name == NULL)return 1;
    err = fus_code_init(&frame->code, sig);
    if(err)return err;
    return 0;
}



void fus_compiler_cleanup(fus_compiler_t *compiler){
    ARRAY_FREE_PTRS(fus_compiler_frame_t*, compiler->frames,
        fus_compiler_frame_cleanup)
}

int fus_compiler_init(fus_compiler_t *compiler, fus_symtable_t *symtable){
    compiler->symtable = symtable;
    compiler->cur_frame = NULL;
    ARRAY_INIT(compiler->frames)
    return 0;
}

int fus_compiler_push_frame(fus_compiler_t *compiler, char *name,
    fus_signature_t *sig
){
    int err;
    fus_compiler_frame_t *new_frame = malloc(sizeof(*new_frame));
    if(new_frame == NULL)return 1;
    err = fus_compiler_frame_init(new_frame, compiler->cur_frame, name, sig);
    if(err)return err;
    ARRAY_PUSH(fus_compiler_frame_t*, compiler->frames, new_frame)
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


static int fus_lexer_get_sig(fus_lexer_t *lexer, fus_signature_t *sig){
    int err;
    err = fus_lexer_get(lexer, "(");
    if(err)return err;
    int encountered_arrow = 0;
    int n_args_in = 0;
    int n_args_out = 0;
    while(1){
        if(fus_lexer_done(lexer) || fus_lexer_got(lexer, ")"))break;
        if(fus_lexer_got(lexer, "->")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            encountered_arrow++;
            if(encountered_arrow > 1){
                ERR_INFO();
                fprintf(stderr, "Encountered multiple \"->\"\n");
                return 2;
            }
        }else{
            err = fus_lexer_get_name(lexer, NULL);
            if(err)return err;

            if(encountered_arrow == 0)n_args_in++;
            else n_args_out++;
        }
    }
    if(encountered_arrow == 0){
        return fus_lexer_unexpected(lexer, "\"->\"");
    }
    err = fus_lexer_get(lexer, ")");
    if(err)return err;

    err = fus_signature_init(sig, n_args_in, n_args_out);
    if(err)return err;
    return 0;
}

static int fus_compiler_compile_frame_from_lexer(fus_compiler_t *compiler,
    fus_lexer_t *lexer, char *name, int depth,
    fus_signature_t *sig, fus_compiler_frame_t **new_frame
){
    int err;
    err = fus_compiler_push_frame(compiler, name, sig);
    if(err)return err;

    fus_compiler_frame_t *frame = compiler->cur_frame;

    for(int i = 0; i < depth; i++)printf("  ");
    printf("Compiling frame: %s\n", frame->name);

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
            fus_signature_t sig;
            err = fus_lexer_get_sig(lexer, &sig);
            if(err)return err;

            printf("Def: %s (%i -> %i)\n", def_name,
                sig.n_args_in, sig.n_args_out);

            err = fus_lexer_get(lexer, "(");
            if(err)return err;
            fus_compiler_frame_t *new_frame = NULL;
            err = fus_compiler_compile_frame_from_lexer(
                compiler, lexer, def_name, depth + 1,
                &sig, &new_frame);
            if(err)return err;
            err = fus_lexer_get(lexer, ")");
            if(err)return err;
        }else if(fus_lexer_got(lexer, "(")){
            int err = fus_lexer_next(lexer);
            if(err)return err;
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Block:\n");
            block_depth++;
            depth++;
        }else if(fus_lexer_got_int(lexer)){
            int i;
            err = fus_lexer_get_int(lexer, &i);
            if(err)return err;
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Int: %i\n", i);
            ARRAY_PUSH(fus_opcode_t, frame->code.opcodes,
                FUS_SYMCODE_INT_LITERAL)
            err = fus_code_push_int(&frame->code, i);
            if(err)return err;
        }else if(fus_lexer_got_str(lexer)){
            char *ss;
            err = fus_lexer_get_str(lexer, &ss);
            if(err)return err;
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Str: %s\n", ss);
            fus_str_t *s = fus_str(ss);
            if(s == NULL)return 1;
            ARRAY_PUSH(fus_opcode_t, frame->code.opcodes,
                FUS_SYMCODE_LITERAL)
            ARRAY_PUSH(fus_value_t, frame->code.literals,
                fus_value_str(s))
            err = fus_code_push_int(&frame->code,
                frame->code.literals_len - 1);
            if(err)return err;
        }else{
            int opcode_sym_i = fus_symtable_find(compiler->symtable,
                lexer->token, lexer->token_len);
            if(opcode_sym_i >= 0){
                fus_sym_t *opcode_sym = fus_symtable_get(compiler->symtable,
                    opcode_sym_i);
                for(int i = 0; i < depth; i++)printf("  ");
                printf("Lexed opcode: %i (%s)\n",
                    opcode_sym_i, opcode_sym->token);
                int err = fus_lexer_next(lexer);
                if(err)return err;

                if(!opcode_sym->autocompile){
                    ERR_INFO();
                    fprintf(stderr, "Opcode can't be used directly: %s\n",
                        opcode_sym->token);
                    return 2;
                }else if(opcode_sym->argtype == FUS_SYMCODE_ARGTYPE_NONE){
                    ARRAY_PUSH(fus_opcode_t, frame->code.opcodes,
                        opcode_sym_i)
                }else if(opcode_sym->argtype == FUS_SYMCODE_ARGTYPE_INT){
                    int i = 0;
                    int err = fus_lexer_get_int(lexer, &i);
                    if(err)return err;
                    ARRAY_PUSH(fus_opcode_t, frame->code.opcodes,
                        opcode_sym_i)
                    err = fus_code_push_int(&frame->code, i);
                    if(err)return err;
                }else if(opcode_sym->argtype == FUS_SYMCODE_ARGTYPE_SYM){
                    int sym_i = fus_symtable_find_or_add(compiler->symtable,
                        lexer->token, lexer->token_len);
                    if(sym_i < 0){
                        ERR_INFO();
                        fprintf(stderr, "Couldn't add sym: %.*s\n",
                            lexer->token_len, lexer->token);
                        return 2;
                    }
                    ARRAY_PUSH(fus_opcode_t, frame->code.opcodes,
                        opcode_sym_i)
                    err = fus_code_push_int(&frame->code, sym_i);
                    if(err)return err;
                    int err = fus_lexer_next(lexer);
                    if(err)return err;
                }else{
                    ERR_INFO();
                    fprintf(stderr, "Not opcode: %s\n",
                        opcode_sym->token);
                    return 2;
                }
            }else{
                for(int i = 0; i < depth; i++)printf("  ");
                printf("Lexed: ");
                fus_lexer_show(lexer, stdout);
                printf("\n");
                int err = fus_lexer_next(lexer);
                if(err)return err;
            }
        }

    }
    err = fus_compiler_pop_frame(compiler);
    if(err)return err;
    if(new_frame != NULL)*new_frame = frame;
    return 0;
}

int fus_compiler_compile_from_lexer(fus_compiler_t *compiler,
    fus_lexer_t *lexer
){
    int err;
    err = fus_compiler_compile_frame_from_lexer(compiler, lexer,
        strdup(lexer->filename), 0, NULL, NULL);
    if(err)return err;
    return 0;
}

