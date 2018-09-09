
#include "includes.h"


static int fus_parse_data(fus_symtable_t *symtable, fus_lexer_t *lexer,
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
    fus_compiler_frame_t **sig_frame_ptr
){
    int err;
    fus_lexer_t *lexer = compiler->lexer;
    fus_compiler_frame_t *sig_frame = NULL;
    if(fus_lexer_got_name(lexer)){
        err = fus_compiler_find_or_add_frame_sig(compiler,
            compiler->cur_frame,
            lexer->token, lexer->token_len, &sig_frame);
        if(err)return err;
        err = fus_lexer_next(lexer);
        if(err)return err;
    }else{
        const char *name = "<sig>";
        err = fus_compiler_add_frame_sig(compiler,
            compiler->cur_frame, strdup(name), &sig_frame);
        if(err)return err;
        err = fus_lexer_get_sig(lexer, &sig_frame->data.sig);
        if(err)return err;
        sig_frame->compiled = true;
    }
    *sig_frame_ptr = sig_frame;
    return 0;
}

static int fus_compiler_blocks_find(fus_compiler_block_t *blocks,
    int blocks_len, const char *token, int token_len
){
    for(int i = 0; i < blocks_len; i++){
        fus_compiler_block_t *block = &blocks[i];
        if(block->type != FUS_COMPILER_BLOCK_TYPE_DO)continue;
        if(strlen(block->label_name) == token_len
            && !strncmp(block->label_name, token, token_len)
        ){
            return i;
        }
    }
    return -1;
}

int fus_compiler_compile_frame_from_path(fus_compiler_t *compiler,
    const char *path, char *name, bool is_module, int depth,
    fus_compiler_frame_t **frame_ptr
){
    int err;

    char *buffer = load_file(path);
    if(buffer == NULL)return 2;

    fus_lexer_t lexer;
    err = fus_lexer_init(&lexer, buffer, path);
    if(err)return err;

    err = fus_compiler_compile_frame_from_lexer(compiler, &lexer,
        name, is_module, depth, frame_ptr);
    if(err)return err;

    fus_lexer_cleanup(&lexer);
    free(buffer);
    return 0;
}

int fus_compiler_compile_frame_from_lexer(fus_compiler_t *compiler,
    fus_lexer_t *lexer, char *name, bool is_module, int depth,
    fus_compiler_frame_t **frame_ptr
){
    int err;

    /* Save previous lexer!.. */
    fus_lexer_t *old_lexer = compiler->lexer;
    compiler->lexer = lexer;

    fus_compiler_frame_t *frame = *frame_ptr;
    if(frame == NULL){
        err = fus_compiler_find_or_add_frame_def(compiler, compiler->cur_frame,
            name, strlen(name), is_module, &frame);
        if(err)return err;
    }

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

    #define FUS_COMPILER_PUSH_BLOCK(TYPE, m_label_name) { \
        ARRAY_PUSH(fus_compiler_block_t, blocks, \
            (fus_compiler_block_t){0}) \
        err = fus_compiler_block_init(&blocks[blocks_len - 1], \
            FUS_COMPILER_BLOCK_TYPE_##TYPE, blocks_len, \
            &frame->data.def.code, m_label_name); \
        if(err)return err; \
    }

    #define FUS_COMPILER_POP_BLOCK(block) { \
        ARRAY_POP(fus_compiler_block_t, blocks, block) \
    }

    bool got_module = false;
    bool got_fun = false;
    bool got_use = false;
    bool got_call = false;
    bool got_next = false;
    bool got_break = false;
    while(1){
        if(fus_lexer_done(lexer))break;

#ifdef FUS_DEBUG_COMPILER
            for(int i = 0; i < depth; i++)printf("  ");
            printf("Lexed: %.*s\n", lexer->token_len, lexer->token);
#endif

        if(fus_lexer_got(lexer, ")")){
            if(blocks_len <= 0)break;
            err = fus_lexer_next(lexer);
            if(err)return err;
            fus_compiler_block_t block;
            ARRAY_POP(fus_compiler_block_t, blocks, block)
            depth--;
            int block_type = block.type;
            err = fus_compiler_block_finish(&block, compiler->symtable);
            if(err)return err;
            fus_compiler_block_cleanup(&block);
            if(block_type == FUS_COMPILER_BLOCK_TYPE_IFELSE_A){
                err = fus_lexer_get(lexer, "(");
                if(err)return err;
                FUS_COMPILER_PUSH_BLOCK(IFELSE_B, NULL)
                depth++;
            }
        }else if(fus_lexer_got(lexer, "do")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            char *label_name = NULL;
            err = fus_lexer_get_name(lexer, &label_name);
            if(err)return err;
            FUS_COMPILER_PUSH_BLOCK(DO, label_name)
            err = fus_lexer_get(lexer, "(");
            if(err)return err;
        }else if(
            (got_next=fus_lexer_got(lexer, "next")) ||
            (got_break=fus_lexer_got(lexer, "break")) ||
            fus_lexer_got(lexer, "while")
        ){
            err = fus_lexer_next(lexer);
            if(err)return err;
            int block_i = fus_compiler_blocks_find(blocks, blocks_len,
                lexer->token, lexer->token_len);
            if(block_i < 0){
                ERR_INFO();
                fprintf(stderr, "Block label not found: %.*s\n",
                    lexer->token_len, lexer->token);
                return 2;
            }
            ARRAY_PUSH(fus_opcode_t, frame->data.def.code.opcodes,
                got_next? FUS_SYMCODE_CONTROL_NEXT:
                got_break? FUS_SYMCODE_CONTROL_BREAK:
                FUS_SYMCODE_CONTROL_WHILE)
            err = fus_code_push_int(&frame->data.def.code, block_i);
            if(err)return err;
            err = fus_lexer_next(lexer);
            if(err)return err;
        }else if(fus_lexer_got(lexer, "if")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            err = fus_lexer_get(lexer, "(");
            if(err)return err;
            FUS_COMPILER_PUSH_BLOCK(IF, NULL)
        }else if(fus_lexer_got(lexer, "ifelse")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            err = fus_lexer_get(lexer, "(");
            if(err)return err;
            FUS_COMPILER_PUSH_BLOCK(IFELSE_A, NULL)
        }else if(fus_lexer_got(lexer, "call")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            if(!fus_lexer_got_name(lexer)){
                return fus_lexer_unexpected(lexer, "name");
            }

            fus_compiler_frame_t *sig_frame = NULL;
            err = fus_compiler_find_or_add_frame_sig(compiler,
                compiler->cur_frame, lexer->token, lexer->token_len,
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
                compiler->cur_frame, lexer->token, lexer->token_len,
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
                def_name = strdup("<fun>");
            }else{
                err = fus_lexer_get_name(lexer, &def_name);
                if(err)return err;
            }

            fus_compiler_frame_t *sig_frame = NULL;
            if(!got_module){
                err = fus_compiler_parse_sig_frame(compiler, &sig_frame);
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
        }else if(fus_lexer_got(lexer, "load")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            err = fus_lexer_get(lexer, "(");
            if(err)return err;

            const char *name = NULL;
            int name_len = 0;
            bool first = true;
            fus_path_t path;
            err = fus_path_init(&path);
            while(1){
                if(fus_lexer_got(lexer, ")")){
                    if(first)return fus_lexer_unexpected(lexer, "name");

                    err = fus_lexer_next(lexer);
                    if(err)return err;
                    break;
                }else if(fus_lexer_got(lexer, "=")){
                    if(first)return fus_lexer_unexpected(lexer, "name");

                    err = fus_lexer_next(lexer);
                    if(err)return err;
                    if(!fus_lexer_got_name(lexer)){
                        return fus_lexer_unexpected(lexer, "name");
                    }

                    name = lexer->token;
                    name_len = lexer->token_len;

                    err = fus_lexer_next(lexer);
                    if(err)return err;
                    err = fus_lexer_get(lexer, ")");
                    if(err)return err;
                    break;
                }else if(!fus_lexer_got_name(lexer)){
                    return fus_lexer_unexpected(lexer, "name");
                }

                name = lexer->token;
                name_len = lexer->token_len;

                if(first)first = false;
                else{
                    err = fus_path_add_separator(&path);
                    if(err)return err;
                }
                err = fus_path_add(&path, lexer->token, lexer->token_len);
                if(err)return err;
                err = fus_lexer_next(lexer);
                if(err)return err;
            }

            const char *ext = ".fus";
            err = fus_path_add(&path, ext, strlen(ext));
            if(err)return err;

            fus_compiler_frame_t *module = NULL;
            err = fus_compiler_find_or_add_frame_def(compiler,
                compiler->cur_frame, name, name_len, true,
                &module);
            if(err)return err;

            if(module->compiled){
                ERR_INFO();
                fprintf(stderr, "Module %s is already compiled!\n",
                    module->name);
                return 2;
            }

            char *load_path = strdup(path.path);
            if(load_path == NULL)return 1;
            module->data.def.load_path = load_path;

            fus_path_cleanup(&path);
        }else if(fus_lexer_got(lexer, "(")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            FUS_COMPILER_PUSH_BLOCK(PAREN, NULL)
            depth++;
        }else if(fus_lexer_got_int(lexer)){
            int i;
            err = fus_lexer_get_int(lexer, &i);
            if(err)return err;
            ARRAY_PUSH(fus_opcode_t, frame->data.def.code.opcodes,
                FUS_SYMCODE_INT_LITERAL)
            err = fus_code_push_int(&frame->data.def.code, i);
            if(err)return err;
        }else if(fus_lexer_got_str(lexer)){
            char *ss;
            err = fus_lexer_get_str(lexer, &ss);
            if(err)return err;
            fus_str_t *s = fus_str(ss);
            if(s == NULL)return 1;
            FUS_COMPILER_PUSH_LITERAL(fus_value_str(s))
        }else if(fus_lexer_got(lexer, "`")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            if(!fus_lexer_got_sym(lexer)){
                return fus_lexer_unexpected(lexer, "sym");
            }
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
        }else if(fus_lexer_got(lexer, "data")){
            err = fus_lexer_next(lexer);
            if(err)return err;
            err = fus_lexer_get(lexer, "(");
            if(err)return err;
            fus_arr_t *a = NULL;
            err = fus_parse_data(compiler->symtable, lexer, &a);
            if(err)return err;
            err = fus_lexer_get(lexer, ")");
            if(err)return err;
            FUS_COMPILER_PUSH_LITERAL(fus_value_arr(a))
        }else if(
            (got_use=fus_lexer_got(lexer, "use")) ||
            (got_call=fus_lexer_got(lexer, "@")) ||
            fus_lexer_got(lexer, "&")
        ){
            err = fus_lexer_next(lexer);
            if(err)return err;

            int use_what = -1; /* -1=N/A 0=module 1=def 2=sig */
            if(got_use){
                if(fus_lexer_got(lexer, "module")){
                    use_what = 0;
                }else if(fus_lexer_got(lexer, "def")){
                    use_what = 1;
                }else if(fus_lexer_got(lexer, "sig")){
                    /* TODO */
                    ERR_INFO();
                    fprintf(stderr, "Not yet implemented\n");
                    return 2;

                    use_what = 2;
                }else{
                    return fus_lexer_unexpected(lexer,
                        "module or def or sig");
                }
                err = fus_lexer_next(lexer);
                if(err)return err;
            }
            bool is_module = use_what == 0;

            fus_compiler_frame_t *def = NULL;
            const char *use_name = NULL;
            int use_name_len = 0;
            if(fus_lexer_got(lexer, "(")){
                fus_compiler_frame_t *parent = compiler->cur_frame;
                err = fus_lexer_next(lexer);
                if(err)return err;
                while(1){
                    const char *token = lexer->token;
                    int token_len = lexer->token_len;
                    err = fus_lexer_next(lexer);
                    if(err)return err;
                    if(fus_lexer_got(lexer, ")")){
                        err = fus_compiler_find_or_add_frame_def(compiler,
                            parent, token, token_len, is_module, &def);
                        if(err)return err;
                        use_name = token;
                        use_name_len = token_len;
                        err = fus_lexer_next(lexer);
                        if(err)return err;
                        break;
                    }else if(got_use && fus_lexer_got(lexer, "=")){
                        err = fus_lexer_next(lexer);
                        if(err)return err;
                        if(!fus_lexer_got_name(lexer)){
                            return fus_lexer_unexpected(lexer, "name");
                        }
                        use_name = lexer->token;
                        use_name_len = lexer->token_len;
                        err = fus_lexer_next(lexer);
                        if(err)return err;
                        err = fus_lexer_get(lexer, ")");
                        if(err)return err;
                        break;
                    }else{
                        if(!fus_lexer_got_name(lexer)){
                            return fus_lexer_unexpected(lexer, "name");
                        }
                        err = fus_compiler_find_or_add_frame_def(compiler,
                            parent, token, token_len, true, &parent);
                        if(err)return err;
                    }
                }
            }else{
                if(got_use){
                    return fus_lexer_unexpected(lexer, "(");}
                if(!fus_lexer_got_name(lexer)){
                    return fus_lexer_unexpected(lexer, "name");}
                err = fus_compiler_find_or_add_frame_def(compiler,
                    compiler->cur_frame,
                    lexer->token, lexer->token_len, is_module, &def);
                if(err)return err;
                err = fus_lexer_next(lexer);
                if(err)return err;
            }

            if(got_use){
                fus_compiler_frame_t *new_frame = NULL;
                if(use_what == 2){
                    err = fus_compiler_find_frame_sig(compiler,
                        compiler->cur_frame, use_name, use_name_len,
                        &new_frame);
                    if(err)return err;
                }else{
                    err = fus_compiler_find_frame_def(compiler,
                        compiler->cur_frame, use_name, use_name_len,
                        is_module, &new_frame);
                    if(err)return err;
                }
                if(new_frame != NULL){
                    ERR_INFO();
                    fprintf(stderr,
                        "Attempted redefinition of %s %i (%s)\n",
                        fus_compiler_frame_type_to_s(new_frame),
                        new_frame->i, new_frame->name);
                    return 2;
                }
                err = fus_compiler_add_frame_ref(compiler,
                    compiler->cur_frame,
                    strndup(use_name, use_name_len), def,
                    &new_frame);
                if(err)return err;
            }else{
                ARRAY_PUSH(fus_opcode_t, frame->data.def.code.opcodes,
                    got_call? FUS_SYMCODE_FRAMES_CALL:
                        FUS_SYMCODE_FUN_LITERAL)
                err = fus_code_push_int(&frame->data.def.code, def->i);
                if(err)return err;
            }
        }else{
            int opcode_sym_i = fus_symtable_find(compiler->symtable,
                lexer->token, lexer->token_len);
            if(opcode_sym_i >= 0){
                fus_sym_t *opcode_sym = fus_symtable_get(compiler->symtable,
                    opcode_sym_i);
                err = fus_lexer_next(lexer);
                if(err)return err;

                if(!opcode_sym->autocompile){
                    ERR_INFO();
                    fprintf(stderr,
                        "Sym can't be used directly as an opcode: %s\n",
                        opcode_sym->token);
                    return 2;
                }else if(opcode_sym->argtype == FUS_SYMCODE_ARGTYPE_NONE){
                    ARRAY_PUSH(fus_opcode_t, frame->data.def.code.opcodes,
                        opcode_sym_i)
                }else if(opcode_sym->argtype == FUS_SYMCODE_ARGTYPE_INT){
                    int i = 0;
                    err = fus_lexer_get_int(lexer, &i);
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
                    err = fus_lexer_next(lexer);
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

    ARRAY_FREE(fus_compiler_block_t, blocks,
        fus_compiler_block_cleanup)

    /* Restore previous lexer!.. */
    compiler->lexer = old_lexer;

    return 0;
}




static void fus_compiler_debug_frames(fus_compiler_t *compiler){
    printf("%i FRAMES:\n", compiler->frames_len);
    for(int i = 0; i < compiler->frames_len; i++){
        fus_compiler_frame_t *frame = compiler->frames[i];
        if(frame->parent != NULL){
            printf("IN %s %i: ",
                fus_compiler_frame_type_to_s(frame->parent),
                frame->parent->i);
        }else{
            printf("IN <ROOT>: ");
        }
        printf("%s %i (%s)",
            fus_compiler_frame_type_to_s(frame), i, frame->name);
        if(frame->type == FUS_COMPILER_FRAME_TYPE_DEF){
            fus_compiler_frame_t *sig_frame = frame->data.def.sig_frame;
            if(sig_frame != NULL){
                printf(" [sig:%i]", sig_frame->i);
            }
            if(frame->data.def.load_path != NULL){
                printf(" [file:%s]", frame->data.def.load_path);
            }
        }
        if(frame->type == FUS_COMPILER_FRAME_TYPE_REF){
            fus_compiler_frame_t *other_frame = frame->data.ref;
            printf(" -> %s %i (%s)",
                fus_compiler_frame_type_to_s(other_frame),
                other_frame->i, other_frame->name);
        }else if(frame->compiled){
            printf(" [compiled]");
        }
        printf("\n");
    }
}

int fus_compiler_finish(fus_compiler_t *compiler){
    int err;

    bool finished = false;
    while(!finished){
        err = fus_compiler_finish_def(compiler, NULL);
        if(err)return err;

#ifdef FUS_DEBUG_COMPILER_FRAMES
        fus_compiler_debug_frames(compiler);
#endif

        finished = true;
        for(int i = 0; i < compiler->frames_len; i++){
            fus_compiler_frame_t *frame = compiler->frames[i];
            if(frame->type != FUS_COMPILER_FRAME_TYPE_DEF)continue;
            if(frame->data.def.load_path != NULL && !frame->compiled){
                err = fus_compiler_compile_frame_from_path(compiler,
                    frame->data.def.load_path,
                    frame->name, true, 0, &frame);
                if(err)return err;

                finished = false;
                break;
            }
        }
    }

    return 0;
}
