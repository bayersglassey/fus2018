
#include "includes.h"


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

static int fus_compiler_parse_sig_frame(fus_compiler_t *compiler,
    fus_lexer_t *lexer, fus_compiler_frame_t **sig_frame_ptr
){
    int err;
    fus_compiler_frame_t *sig_frame = NULL;
    if(fus_lexer_got_name(lexer)){
        err = fus_compiler_find_or_add_frame_sig(compiler,
            compiler->cur_module,
            lexer->token, lexer->token_len, &sig_frame);
        if(err)return err;
        err = fus_lexer_next(lexer);
        if(err)return err;
    }else{
        const char *name = "<anon-sig>";
        err = fus_compiler_add_frame_sig(compiler,
            compiler->cur_module, strdup(name), &sig_frame);
        if(err)return err;
        err = fus_lexer_get_sig(lexer, &sig_frame->data.sig);
        if(err)return err;
        sig_frame->compiled = true;
    }
    *sig_frame_ptr = sig_frame;
    return 0;
}

static int fus_compiler_compile_frame_from_lexer(fus_compiler_t *compiler,
    fus_lexer_t *lexer, char *name, bool is_module, int depth,
    fus_compiler_frame_t **frame_ptr
){
    int err;
    fus_compiler_frame_t *frame = NULL;
    err = fus_compiler_find_or_add_frame_def(compiler, compiler->cur_module,
        name, strlen(name), is_module, &frame);
    if(err)return err;

    if(frame->compiled){
        ERR_INFO();
        fprintf(stderr, "Redefinition of %s: %i (%s)\n",
            frame->data.def.is_module? "module": "def", frame->i, frame->name);
        return 2;
    }

    /* If frame was only declared previously, its parent will be whatever
    compiler->cur_frame was at the time of declaration.
    We update it here to be compiler->cur_frame at time of definition. */
    frame->parent = compiler->cur_frame;

    err = fus_compiler_push_frame_def(compiler, frame);
    if(err)return err;

#ifdef FUS_DEBUG_COMPILER
    for(int i = 0; i < depth; i++)printf("  ");
    printf("Compiling frame: %i (%s)\n", frame->i, frame->name);
#endif

    #define FUS_COMPILER_PUSH_LITERAL(m_value) { \
        fus_value_t value = m_value; \
        ARRAY_PUSH(fus_opcode_t, frame->data.def.code.opcodes, \
            FUS_SYMCODE_LITERAL) \
        ARRAY_PUSH(fus_value_t, frame->data.def.code.literals, value) \
        fus_value_attach(value); \
        err = fus_code_push_int(&frame->data.def.code, \
            frame->data.def.code.literals_len - 1); \
        if(err)return err; \
    }

    ARRAY_DECL(fus_compiler_block_t, blocks)
    ARRAY_INIT(blocks)

    #define FUS_COMPILER_PUSH_BLOCK(TYPE) { \
        ARRAY_PUSH(fus_compiler_block_t, blocks, \
            (fus_compiler_block_t){0}) \
        err = fus_compiler_block_init(&blocks[blocks_len - 1], \
            FUS_COMPILER_BLOCK_TYPE_##TYPE, \
            &frame->data.def.code); \
        if(err)return err; \
    }

    #define FUS_COMPILER_POP_BLOCK(block) { \
        ARRAY_POP(fus_compiler_block_t, blocks, block) \
    }

    bool got_module = false;
    bool got_fun = false;
    bool got_call = false;
    while(1){
        if(fus_lexer_done(lexer)){
            break;
        }else if(fus_lexer_got(lexer, ")")){
#ifdef FUS_DEBUG_COMPILER
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Done.\n");
#endif
            if(blocks_len <= 0)break;
            err = fus_lexer_next(lexer);
            if(err)return err;
            fus_compiler_block_t block;
            ARRAY_POP(fus_compiler_block_t, blocks, block)
            depth--;
            int block_type = block.type;
            err = fus_compiler_block_finish(&block);
            if(err)return err;
            if(block_type == FUS_COMPILER_BLOCK_TYPE_IFELSE_A){
                err = fus_lexer_get(lexer, "(");
                if(err)return err;
                FUS_COMPILER_PUSH_BLOCK(IFELSE_B)
                depth++;
            }
        }else if(fus_lexer_got(lexer, "do")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            err = fus_lexer_get(lexer, "(");
            if(err)return err;
            FUS_COMPILER_PUSH_BLOCK(DO)
        }else if(fus_lexer_got(lexer, "if")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            err = fus_lexer_get(lexer, "(");
            if(err)return err;
            FUS_COMPILER_PUSH_BLOCK(IF)
        }else if(fus_lexer_got(lexer, "ifelse")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            err = fus_lexer_get(lexer, "(");
            if(err)return err;
            FUS_COMPILER_PUSH_BLOCK(IFELSE_A)
        }else if(fus_lexer_got(lexer, "call")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            if(!fus_lexer_got_name(lexer)){
                return fus_lexer_unexpected(lexer, "name");
            }

            fus_compiler_frame_t *sig_frame = NULL;
            err = fus_compiler_find_or_add_frame_sig(compiler,
                compiler->cur_module, lexer->token, lexer->token_len,
                &sig_frame);
            if(err)return err;

            ARRAY_PUSH(fus_opcode_t, frame->data.def.code.opcodes,
                FUS_SYMCODE_FUN_CALL)
            err = fus_code_push_int(&frame->data.def.code, sig_frame->i);
            if(err)return err;

            err = fus_lexer_next(lexer);
            if(err)return err;
        }else if(fus_lexer_got(lexer, "sig")){
            err = fus_lexer_next(lexer);
            if(err)return err;

            if(!fus_lexer_got_name(lexer)){
                return fus_lexer_unexpected(lexer, "name");
            }

            fus_compiler_frame_t *frame = NULL;
            err = fus_compiler_find_or_add_frame_sig(compiler,
                compiler->cur_module, lexer->token, lexer->token_len,
                &frame);
            if(err)return err;
            if(frame->compiled){
                ERR_INFO();
                fprintf(stderr, "Redefinition of sig: %i (%s)\n",
                    frame->i, frame->name);
                return 2;
            }

            err = fus_lexer_next(lexer);
            if(err)return err;

            err = fus_lexer_get_sig(lexer, &frame->data.sig);
            if(err)return err;
            frame->compiled = true;
        }else if(
            (got_module=fus_lexer_got(lexer, "module")) ||
            (got_fun=fus_lexer_got(lexer, "fun")) ||
            fus_lexer_got(lexer, "def")
        ){
            err = fus_lexer_next(lexer);
            if(err)return err;

            char *def_name = NULL;
            if(got_fun){
                def_name = strdup("<anon-def>");
            }else{
                err = fus_lexer_get_name(lexer, &def_name);
                if(err)return err;
            }

            fus_compiler_frame_t *sig_frame = NULL;
            if(!got_module){
                err = fus_compiler_parse_sig_frame(compiler, lexer,
                    &sig_frame);
                if(err)return err;
            }

#ifdef FUS_DEBUG_COMPILER
            for(int i = 0; i < depth; i++)printf("  ");
            printf("%s: %s (%i -> %i)\n",
                got_module? "Module": "Def", def_name,
                sig_frame->data.sig.n_args_in,
                sig_frame->data.sig.n_args_out);
#endif

            err = fus_lexer_get(lexer, "(");
            if(err)return err;
            fus_compiler_frame_t *new_frame = NULL;
            err = fus_compiler_compile_frame_from_lexer(
                compiler, lexer, def_name, got_module, depth + 1,
                &new_frame);
            if(err)return err;
            new_frame->data.def.sig_frame = sig_frame;
            err = fus_lexer_get(lexer, ")");
            if(err)return err;

            if(got_fun){
                ARRAY_PUSH(fus_opcode_t, frame->data.def.code.opcodes,
                    FUS_SYMCODE_FUN_LITERAL)
                err = fus_code_push_int(&frame->data.def.code, new_frame->i);
                if(err)return err;
            }
        }else if(fus_lexer_got(lexer, "(")){
            int err = fus_lexer_next(lexer);
            if(err)return err;
#ifdef FUS_DEBUG_COMPILER
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Block:\n");
#endif
            FUS_COMPILER_PUSH_BLOCK(PAREN)
            depth++;
        }else if(fus_lexer_got_int(lexer)){
            int i;
            err = fus_lexer_get_int(lexer, &i);
            if(err)return err;
#ifdef FUS_DEBUG_COMPILER
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Int: %i\n", i);
#endif
            ARRAY_PUSH(fus_opcode_t, frame->data.def.code.opcodes,
                FUS_SYMCODE_INT_LITERAL)
            err = fus_code_push_int(&frame->data.def.code, i);
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
        }else if(
            (got_call=fus_lexer_got(lexer, "@")) ||
            fus_lexer_got(lexer, "&")
        ){
            err = fus_lexer_next(lexer);
            if(err)return err;
            fus_compiler_frame_t *def = NULL;
            if(fus_lexer_got(lexer, "(")){
                fus_compiler_frame_t *module = compiler->cur_module;
                err = fus_lexer_next(lexer);
                if(err)return err;
                while(1){
                    const char *token = lexer->token;
                    int token_len = lexer->token_len;
                    err = fus_lexer_next(lexer);
                    if(err)return err;
                    if(fus_lexer_got(lexer, ")")){
                        err = fus_compiler_find_or_add_frame_def(compiler,
                            module, token, token_len, false, &def);
                        if(err)return err;
                        break;
                    }else{
                        if(!fus_lexer_got_name(lexer)){
                            return fus_lexer_unexpected(lexer, "name");
                        }
                        err = fus_compiler_find_or_add_frame_def(compiler,
                            module, token, token_len, true, &module);
                        if(err)return err;
                    }
                }
            }else{
                if(!fus_lexer_got_name(lexer)){
                    return fus_lexer_unexpected(lexer, "name");
                }
                err = fus_compiler_find_or_add_frame_def(compiler,
                    compiler->cur_module,
                    lexer->token, lexer->token_len, false, &def);
                if(err)return err;
            }
#ifdef FUS_DEBUG_COMPILER
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Lexed %s: %i (%s)\n", got_call? "call": "callref",
                def->i, def->name);
#endif
            err = fus_lexer_next(lexer);
            if(err)return err;
            ARRAY_PUSH(fus_opcode_t, frame->data.def.code.opcodes,
                got_call? FUS_SYMCODE_CALL: FUS_SYMCODE_FUN_LITERAL)
            err = fus_code_push_int(&frame->data.def.code, def->i);
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
                    ARRAY_PUSH(fus_opcode_t, frame->data.def.code.opcodes,
                        opcode_sym_i)
                }else if(opcode_sym->argtype == FUS_SYMCODE_ARGTYPE_INT){
                    int i = 0;
                    int err = fus_lexer_get_int(lexer, &i);
                    if(err)return err;
                    ARRAY_PUSH(fus_opcode_t, frame->data.def.code.opcodes,
                        opcode_sym_i)
                    err = fus_code_push_int(&frame->data.def.code, i);
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
                    ARRAY_PUSH(fus_opcode_t, frame->data.def.code.opcodes,
                        opcode_sym_i)
                    err = fus_code_push_int(&frame->data.def.code, sym_i);
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
    err = fus_compiler_pop_frame_def(compiler);
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
        strdup(lexer->filename), true, 0, NULL);
    if(err)return err;
    compiler->root_frame = compiler->frames[0];
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
