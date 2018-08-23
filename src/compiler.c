
#include "includes.h"




void fus_compiler_frame_cleanup(fus_compiler_frame_t *frame){
    free(frame->name);
    fus_code_cleanup(&frame->code);
}

int fus_compiler_frame_init(fus_compiler_frame_t *frame, int i,
    fus_compiler_frame_t *module,
    fus_compiler_frame_t *parent,
    char *name, fus_signature_t *sig, bool is_module
){
    int err;
    frame->i = i;
    frame->compiled = false;
    frame->is_module = is_module;
    frame->module = module;
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
    compiler->cur_module = NULL;
    compiler->cur_frame = NULL;
    ARRAY_INIT(compiler->frames)
    return 0;
}

int fus_compiler_get_frame(fus_compiler_t *compiler, int i,
    fus_compiler_frame_t **frame_ptr
){
    int err;
    if(i < 0 || i >= compiler->frames_len){
        ERR_INFO();
        fprintf(stderr, "Frame %i not found\n", i);
        return 2;
    }
    *frame_ptr = compiler->frames[i];
    return 0;
}

int fus_compiler_add_frame(fus_compiler_t *compiler, char *name,
    fus_signature_t *sig, bool is_module, fus_compiler_frame_t **frame_ptr
){
    int err;
    fus_compiler_frame_t *new_frame = malloc(sizeof(*new_frame));
    if(new_frame == NULL)return 1;
    err = fus_compiler_frame_init(new_frame, compiler->frames_len,
        compiler->cur_module, compiler->cur_frame, name, sig, is_module);
    if(err)return err;
    ARRAY_PUSH(fus_compiler_frame_t*, compiler->frames, new_frame)
    *frame_ptr = new_frame;
    return 0;
}

int fus_compiler_push_frame(fus_compiler_t *compiler,
    fus_compiler_frame_t *frame
){
    if(frame->is_module){
        compiler->cur_module = frame;
    }
    compiler->cur_frame = frame;
    return 0;
}

int fus_compiler_pop_frame(fus_compiler_t *compiler){
    fus_compiler_frame_t *frame = compiler->cur_frame;
    if(frame == NULL){
        ERR_INFO();
        fprintf(stderr, "No frame to pop\n");
        return 2;
    }
    if(frame->is_module){
        compiler->cur_module = frame->parent;
    }
    compiler->cur_frame = frame->parent;
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

static int fus_parse_quote(fus_symtable_t *symtable, fus_lexer_t *lexer,
    fus_arr_t **arr_ptr
){
    int err;

    ARRAY_DECL(fus_arr_t*, prev_arrs)
    ARRAY_INIT(prev_arrs)
    fus_arr_t *cur_arr = malloc(sizeof(*cur_arr));
    if(cur_arr == NULL)return 1;
    err = fus_arr_init(cur_arr);
    if(err)return err;

    while(1){
        if(fus_lexer_got(lexer, "(")){
            err = fus_lexer_next(lexer);
            if(err)return err;

            ARRAY_PUSH(fus_arr_t*, prev_arrs, cur_arr)
            cur_arr = malloc(sizeof(*cur_arr));
            if(cur_arr == NULL)return 1;
            err = fus_arr_init(cur_arr);
            if(err)return err;
        }else if(fus_lexer_got(lexer, ")")){
            if(prev_arrs_len <= 0)break;
            err = fus_lexer_next(lexer);
            if(err)return err;
            fus_arr_t *old_arr = cur_arr;
            ARRAY_POP(fus_arr_t*, prev_arrs, cur_arr)
            err = fus_arr_push(cur_arr, fus_value_arr(old_arr));
            if(err)return err;
        }else if(fus_lexer_got_int(lexer)){
            int i = 0;
            err = fus_lexer_get_int(lexer, &i);
            if(err)return err;
            err = fus_arr_push(cur_arr, fus_value_int(i));
            if(err)return err;
        }else if(fus_lexer_got_str(lexer)){
            char *s = NULL;
            err = fus_lexer_get_str(lexer, &s);
            if(err)return err;
            fus_str_t *ss = fus_str(s);
            if(ss == NULL)return 1;
            err = fus_arr_push(cur_arr, fus_value_str(ss));
            if(err)return err;
        }else if(fus_lexer_done(lexer)){
            return fus_lexer_unexpected(lexer, NULL);
        }else{
            int sym_i = fus_symtable_find_or_add(symtable,
                lexer->token, lexer->token_len);
            if(sym_i < 0)return 1;
            err = fus_lexer_next(lexer);
            if(err)return err;
            err = fus_arr_push(cur_arr, fus_value_sym(sym_i));
            if(err)return err;
        }
    }

    ARRAY_FREE(fus_arr_t*, prev_arrs, (void))

    *arr_ptr = cur_arr;
    return 0;
}

static int fus_compiler_compile_frame_from_lexer(fus_compiler_t *compiler,
    fus_lexer_t *lexer, char *name, bool is_module, int depth,
    fus_signature_t *sig, fus_compiler_frame_t **frame_ptr
){
    int err;
    fus_compiler_frame_t *frame = NULL;
    err = fus_compiler_find_or_add_frame(
        compiler, name, strlen(name), sig, is_module, &frame);
    if(err)return err;
    err = fus_compiler_push_frame(compiler, frame);
    if(err)return err;

    if(!frame->code.has_sig && !is_module){
        /* It may be the case that frame was previously declared, but
        only now is it being defined and given a signature */
        err = fus_code_init_sig(&frame->code, sig);
        if(err)return err;
    }

#ifdef FUS_DEBUG_COMPILER
    for(int i = 0; i < depth; i++)printf("  ");
    printf("Compiling frame: %i (%s)\n", frame->i, frame->name);
#endif

    #define FUS_COMPILER_PUSH_LITERAL(m_value) { \
        fus_value_t value = m_value; \
        ARRAY_PUSH(fus_opcode_t, frame->code.opcodes, \
            FUS_SYMCODE_LITERAL) \
        ARRAY_PUSH(fus_value_t, frame->code.literals, value) \
        fus_value_attach(value); \
        err = fus_code_push_int(&frame->code, \
            frame->code.literals_len - 1); \
        if(err)return err; \
    }

    bool got_module = false;
    int block_depth = 0;
    while(1){
        if(fus_lexer_done(lexer)){
            break;
        }else if(fus_lexer_got(lexer, ")")){
#ifdef FUS_DEBUG_COMPILER
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Done. depth=%i, block_depth=%i\n", depth, block_depth);
#endif
            if(block_depth <= 0)break;
            err = fus_lexer_next(lexer);
            if(err)return err;
            block_depth--;
            depth--;
        }else if(
            (got_module=fus_lexer_got(lexer, "module")) ||
            fus_lexer_got(lexer, "def")
        ){
            err = fus_lexer_next(lexer);
            if(err)return err;

            char *def_name = NULL;
            err = fus_lexer_get_name(lexer, &def_name);
            if(err)return err;

            fus_signature_t sig;
            if(!got_module){
                err = fus_lexer_get_sig(lexer, &sig);
                if(err)return err;
            }

#ifdef FUS_DEBUG_COMPILER
            for(int i = 0; i < depth; i++)printf("  ");
            printf("%s: %s (%i -> %i)\n",
                got_module? "Module": "Def",
                def_name, sig.n_args_in, sig.n_args_out);
#endif

            err = fus_lexer_get(lexer, "(");
            if(err)return err;
            fus_compiler_frame_t *new_frame = NULL;
            err = fus_compiler_compile_frame_from_lexer(
                compiler, lexer, def_name, got_module, depth + 1,
                got_module? NULL: &sig, &new_frame);
            if(err)return err;
            err = fus_lexer_get(lexer, ")");
            if(err)return err;
        }else if(fus_lexer_got(lexer, "(")){
            int err = fus_lexer_next(lexer);
            if(err)return err;
#ifdef FUS_DEBUG_COMPILER
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Block:\n");
#endif
            block_depth++;
            depth++;
        }else if(fus_lexer_got_int(lexer)){
            int i;
            err = fus_lexer_get_int(lexer, &i);
            if(err)return err;
#ifdef FUS_DEBUG_COMPILER
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Int: %i\n", i);
#endif
            ARRAY_PUSH(fus_opcode_t, frame->code.opcodes,
                FUS_SYMCODE_INT_LITERAL)
            err = fus_code_push_int(&frame->code, i);
            if(err)return err;
        }else if(fus_lexer_got_str(lexer)){
            char *ss;
            err = fus_lexer_get_str(lexer, &ss);
            if(err)return err;
#ifdef FUS_DEBUG_COMPILER
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Str: %s\n", ss);
#endif
            fus_str_t *s = fus_str(ss);
            if(s == NULL)return 1;
            FUS_COMPILER_PUSH_LITERAL(fus_value_str(s))
        }else if(fus_lexer_got(lexer, "`")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            if(!fus_lexer_got_sym(lexer)){
                return fus_lexer_unexpected(lexer, "sym");
            }
#ifdef FUS_DEBUG_COMPILER
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Sym: %.*s\n", lexer->token_len, lexer->token);
#endif
            int sym_i = fus_symtable_find_or_add(compiler->symtable,
                lexer->token, lexer->token_len);
            if(sym_i < 0)return 1;
            err = fus_lexer_next(lexer);
            if(err)return err;
            FUS_COMPILER_PUSH_LITERAL(fus_value_sym(sym_i))
        }else if(fus_lexer_got(lexer, "ignore")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            err = fus_lexer_get(lexer, "(");
            if(err)return err;
            err = fus_lexer_parse_silent(lexer);
            if(err)return err;
            err = fus_lexer_get(lexer, ")");
            if(err)return err;
        }else if(fus_lexer_got(lexer, "quote")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            err = fus_lexer_get(lexer, "(");
            if(err)return err;
            fus_arr_t *a = NULL;
            err = fus_parse_quote(compiler->symtable, lexer, &a);
            if(err)return err;
            err = fus_lexer_get(lexer, ")");
            if(err)return err;
            FUS_COMPILER_PUSH_LITERAL(fus_value_arr(a))
        }else if(fus_lexer_got(lexer, "@")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            if(!fus_lexer_got_name(lexer)){
                return fus_lexer_unexpected(lexer, "name");
            }
            fus_compiler_frame_t *def = NULL;
            err = fus_compiler_find_or_add_frame(compiler,
                lexer->token, lexer->token_len, NULL, false, &def);
            if(err)return err;
#ifdef FUS_DEBUG_COMPILER
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Lexed call: %i (%s)\n", def->i, def->name);
#endif
            err = fus_lexer_next(lexer);
            if(err)return err;
            ARRAY_PUSH(fus_opcode_t, frame->code.opcodes,
                FUS_SYMCODE_CALL)
            err = fus_code_push_int(&frame->code, def->i);
            if(err)return err;
        }else{
            int opcode_sym_i = fus_symtable_find(compiler->symtable,
                lexer->token, lexer->token_len);
            if(opcode_sym_i >= 0){
                fus_sym_t *opcode_sym = fus_symtable_get(compiler->symtable,
                    opcode_sym_i);
#ifdef FUS_DEBUG_COMPILER
                for(int i = 0; i < depth; i++)printf("  ");
                printf("Lexed opcode: %i (%s)\n",
                    opcode_sym_i, opcode_sym->token);
#endif
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
                ERR_INFO();
                printf("Unrecognized token: ");
                fus_lexer_show(lexer, stdout);
                printf("\n");
                return 2;
            }
        }

    }
    err = fus_compiler_pop_frame(compiler);
    if(err)return err;
    if(frame_ptr != NULL)*frame_ptr = frame;
    frame->compiled = true;
    return 0;
}

int fus_compiler_compile_from_lexer(fus_compiler_t *compiler,
    fus_lexer_t *lexer
){
    int err;
    err = fus_compiler_compile_frame_from_lexer(compiler, lexer,
        strdup(lexer->filename), true, 0, NULL, NULL);
    if(err)return err;
    for(int i = 0; i < compiler->frames_len; i++){
        fus_compiler_frame_t *frame = compiler->frames[i];
        if(!frame->compiled){
            ERR_INFO();
            fprintf(stderr, "Frame declared but not compiled: %i (%s)\n",
                frame->i, frame->name);
            return 2;
        }
    }
    return 0;
}

int fus_compiler_find_frame(
    fus_compiler_t *compiler, fus_compiler_frame_t *module,
    const char *token, int token_len,
    bool is_module, fus_compiler_frame_t **frame_ptr
){
    for(int i = 0; i < compiler->frames_len; i++){
        fus_compiler_frame_t *frame = compiler->frames[i];
        if(frame->module != module)continue;
        if(strlen(frame->name) == token_len
            && !strncmp(frame->name, token, token_len)
        ){
            if(frame->is_module != is_module){
                ERR_INFO();
                fprintf(stderr, "Found frame %s but is_module is wrong: "
                    "%i, expected %i\n", frame->name,
                    frame->is_module, is_module);
                return 2;
            }
            *frame_ptr = frame;
            return 0;
        }
    }
    *frame_ptr = NULL;
    return 0;
}

int fus_compiler_find_or_add_frame(
    fus_compiler_t *compiler,
    const char *token, int token_len,
    fus_signature_t *sig, bool is_module, fus_compiler_frame_t **frame_ptr
){
    int err;
    fus_compiler_frame_t *frame = NULL;
    err = fus_compiler_find_frame(compiler,
        compiler->cur_module, token, token_len, is_module, &frame);
    if(err)return err;
    if(frame == NULL){
        int err = fus_compiler_add_frame(compiler,
            strndup(token, token_len), sig, is_module, &frame);
        if(err)return err;
    }
    *frame_ptr = frame;
    return 0;
}

