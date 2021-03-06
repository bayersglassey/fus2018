
#include "includes.h"


/******************
 * COMPILER BLOCK *
 ******************/


#define FUS_COMPILER_JUMP_PLACEHOLDER (-1)
    /* Placeholder value for a jump location we don't yet know,
    specifically, the end of the current block.
    Should be filled in by fus_compiler_block_finish. */


void fus_compiler_block_cleanup(fus_compiler_block_t *block){
    free(block->label_name);
}

int fus_compiler_block_init(fus_compiler_block_t *block, int type,
    int depth, fus_code_t *code, char *label_name
){
    int err;
    block->type = type;
    block->depth = depth;
    block->code = code;
    block->opcode_i = code->opcodes_len;
    block->label_name = label_name;

#ifdef FUS_DEBUG_COMPILER_BLOCKS
    printf("%5i:", block->opcode_i);
    for(int i = 0; i < block->depth; i++)printf("  ");
    printf("Entering block: %i -> ...\n", block->opcode_i);
#endif

    if(type == FUS_COMPILER_BLOCK_TYPE_IF
        || type == FUS_COMPILER_BLOCK_TYPE_IFELSE_A
    ){
        ARRAY_PUSH(fus_opcode_t, code->opcodes,
            FUS_SYMCODE_CONTROL_JUMPIFNOT)
        err = fus_code_push_int(code, FUS_COMPILER_JUMP_PLACEHOLDER);
        if(err)return err;
    }
    return 0;
}

int fus_compiler_block_finish(fus_compiler_block_t *block,
    fus_symtable_t *symtable
){
    int err;
    int type = block->type;
    fus_code_t *code = block->code;

    int opcode_i0 = block->opcode_i;

    bool is_jump =
        type == FUS_COMPILER_BLOCK_TYPE_IF ||
        type == FUS_COMPILER_BLOCK_TYPE_IFELSE_A ||
        type == FUS_COMPILER_BLOCK_TYPE_IFELSE_B;

    bool is_do =
        type == FUS_COMPILER_BLOCK_TYPE_DO;

    if(type == FUS_COMPILER_BLOCK_TYPE_IFELSE_A){
        /* Set up the jump to end of B block */
        ARRAY_PUSH(fus_opcode_t, code->opcodes,
            FUS_SYMCODE_CONTROL_JUMP)
        err = fus_code_push_int(code, FUS_COMPILER_JUMP_PLACEHOLDER);
        if(err)return err;
    }else if(type == FUS_COMPILER_BLOCK_TYPE_DO){
        ARRAY_PUSH(fus_opcode_t, code->opcodes,
            FUS_SYMCODE_CONTROL_JUMP)
        err = fus_code_push_int(code, opcode_i0);
        if(err)return err;
    }

    int opcode_i1 = code->opcodes_len;
    int opcode_i_A = opcode_i0 - 1 - FUS_CODE_OPCODES_PER_INT;

    if(type == FUS_COMPILER_BLOCK_TYPE_IFELSE_B){
        /* Reach back into end of A block, set the jump value to end
        of B block (now that we know it). */
        fus_code_set_int(code, opcode_i_A + 1, opcode_i1);
    }

#ifdef FUS_DEBUG_COMPILER_BLOCKS
    printf("%5i:", opcode_i1);
    for(int i = 0; i < block->depth; i++)printf("  ");
    printf("Finishing block: %i -> %i\n", opcode_i0, opcode_i1);
#endif

    int opcode_i00 =
        type == FUS_COMPILER_BLOCK_TYPE_IFELSE_B? opcode_i_A: opcode_i0;
    for(int i = opcode_i00; i < opcode_i1;){
        fus_opcode_t opcode = code->opcodes[i];
        fus_sym_t *opcode_sym = fus_symtable_get(symtable, opcode);

        if(is_jump){
            if(
                opcode_sym->argtype == FUS_SYMCODE_ARGTYPE_JUMP && (
                    fus_code_get_int(code, i + 1)
                    == FUS_COMPILER_JUMP_PLACEHOLDER
                )
            )fus_code_set_int(code, i + 1, opcode_i1);
        }else if(is_do){
            fus_opcode_t new_opcode = opcode;
            if(opcode == FUS_SYMCODE_CONTROL_NEXT){
                new_opcode = FUS_SYMCODE_CONTROL_JUMP;
                fus_code_set_int(code, i + 1, opcode_i0);
            }else if(opcode == FUS_SYMCODE_CONTROL_BREAK){
                new_opcode = FUS_SYMCODE_CONTROL_JUMP;
                fus_code_set_int(code, i + 1, opcode_i1);
            }else if(opcode == FUS_SYMCODE_CONTROL_WHILE){
                new_opcode = FUS_SYMCODE_CONTROL_JUMPIFNOT;
                fus_code_set_int(code, i + 1, opcode_i1);
            }
            if(new_opcode != opcode){
                opcode = new_opcode;
                code->opcodes[i] = opcode;
                opcode_sym = fus_symtable_get(symtable, opcode);
            }
        }

#ifdef FUS_DEBUG_COMPILER_BLOCKS
        printf("%5i:", i);
        for(int i = 0; i < block->depth; i++)printf("  ");
        printf("  ");
        fus_code_print_opcode_at(code, i, symtable, stdout);
        printf("\n");
#endif

        i += fus_symcode_argtype_get_size(opcode_sym->argtype);
    }

    return 0;
}


/******************
 * COMPILER FRAME *
 ******************/

void fus_compiler_frame_cleanup(fus_compiler_frame_t *frame){
    free(frame->name);
    if(frame->type == FUS_COMPILER_FRAME_TYPE_DEF){
        fus_code_cleanup(&frame->data.def.code);
    }else if(frame->type == FUS_COMPILER_FRAME_TYPE_SIG){
        fus_signature_cleanup(&frame->data.sig);
    }
}

int fus_compiler_frame_init(fus_compiler_frame_t *frame, int i,
    fus_compiler_frame_t *parent, char *name, int pos, int row, int col
){
    int err;
    frame->type = FUS_COMPILER_FRAME_TYPE_NONE;
    frame->i = i;
    frame->parent = parent;
    frame->depth = parent == NULL? 0: parent->depth + 1;
    frame->pos = pos;
    frame->row = row;
    frame->col = col;
    frame->name = name;
    frame->compiled = false;
    if(frame->name == NULL)return 1;
    return 0;
}

int fus_compiler_frame_init_def(fus_compiler_frame_t *frame, bool is_module){
    int err;
    frame->type = FUS_COMPILER_FRAME_TYPE_DEF;
    frame->data.def.load_path = NULL;
    frame->data.def.is_module = is_module;
    frame->data.def.sig_frame = NULL;
    err = fus_code_init(&frame->data.def.code, frame);
    if(err)return err;
    return 0;
}

int fus_compiler_frame_init_sig(fus_compiler_frame_t *frame){
    int err;
    frame->type = FUS_COMPILER_FRAME_TYPE_SIG;
    err = fus_signature_init(&frame->data.sig, 0, 0);
    if(err)return err;
    return 0;
}


const char *fus_compiler_frame_type_to_s(fus_compiler_frame_t *frame){
    if(frame->type == FUS_COMPILER_FRAME_TYPE_SIG)return "SIG";
    if(frame->type == FUS_COMPILER_FRAME_TYPE_REF)return "REF";
    if(frame->type == FUS_COMPILER_FRAME_TYPE_DEF){
        return frame->data.def.is_module? "MOD": "DEF";
    }
    return "<UNKNOWN>";
}

void fus_compiler_frame_debug_info(fus_compiler_frame_t *frame, FILE *f,
    int depth
){
    while(frame != NULL){
        for(int i = 0; i < depth; i++)fprintf(f, " ");
        fprintf(f, "In %s %i (%s)",
            fus_compiler_frame_type_to_s(frame),
            frame->i, frame->name);
        fprintf(f, " at row=%i, col=%i",
            frame->row, frame->col);
        if(frame->type == FUS_COMPILER_FRAME_TYPE_DEF
            && frame->data.def.load_path != NULL
        ){
            fprintf(f, " [file:%s]",
                frame->data.def.load_path);
        }
        fprintf(f, "\n");

        frame = frame->parent;
    }
}




/************
 * COMPILER *
 ************/

void fus_compiler_cleanup(fus_compiler_t *compiler){
    ARRAY_FREE_PTRS(fus_compiler_frame_t*, compiler->frames,
        fus_compiler_frame_cleanup)
}

int fus_compiler_init(fus_compiler_t *compiler, fus_symtable_t *symtable){
    compiler->symtable = symtable;
    compiler->lexer = NULL;
    compiler->cur_frame = NULL;
    compiler->root_frame = NULL;
    ARRAY_INIT(compiler->frames)
    return 0;
}



/* COMPILER GET FRAME */

int fus_compiler_get_root_frame(fus_compiler_t *compiler,
    fus_compiler_frame_t **frame_ptr
){
    if(compiler->root_frame == NULL){
        ERR_INFO();
        fprintf(stderr, "No root frame\n");
        return 2;
    }
    *frame_ptr = compiler->root_frame;
    return 0;
}

int fus_compiler_get_frame(fus_compiler_t *compiler, int i,
    bool follow_refs, fus_compiler_frame_t **frame_ptr
){
    int err;
    if(i < 0 || i >= compiler->frames_len){
        ERR_INFO();
        fprintf(stderr, "Frame %i not found\n", i);
        return 2;
    }
    fus_compiler_frame_t *frame = compiler->frames[i];
    if(follow_refs){
        while(frame->type == FUS_COMPILER_FRAME_TYPE_REF){
            frame = frame->data.ref;}
    }
    *frame_ptr = frame;
    return 0;
}




/* COMPILER ADD FRAME */

int fus_compiler_add_frame(fus_compiler_t *compiler,
    fus_compiler_frame_t *parent, char *name,
    fus_compiler_frame_t **frame_ptr
){
    int err;
    fus_compiler_frame_t *new_frame = malloc(sizeof(*new_frame));
    if(new_frame == NULL)return 1;

    int pos=0, row=0, col=0;
    if(compiler->lexer != NULL){
        pos = compiler->lexer->pos;
        row = compiler->lexer->row;
        col = compiler->lexer->col;
    }else{
        ERR_INFO();
        fprintf(stderr, "WARNING: compiler->lexer == NULL\n");
    }

    err = fus_compiler_frame_init(new_frame, compiler->frames_len,
        parent, name, pos, row, col);
    if(err)return err;
    ARRAY_PUSH(fus_compiler_frame_t*, compiler->frames, new_frame)
    *frame_ptr = new_frame;
    return 0;
}

int fus_compiler_add_frame_def(fus_compiler_t *compiler,
    fus_compiler_frame_t *parent, char *name,
    bool is_module, fus_compiler_frame_t **frame_ptr
){
    int err;
    fus_compiler_frame_t *new_frame = NULL;
    err = fus_compiler_add_frame(compiler, parent, name, &new_frame);
    if(err)return err;
    err = fus_compiler_frame_init_def(new_frame, is_module);
    if(err)return err;
    *frame_ptr = new_frame;
    return 0;
}

int fus_compiler_add_frame_sig(fus_compiler_t *compiler,
    fus_compiler_frame_t *parent, char *name,
    fus_compiler_frame_t **frame_ptr
){
    int err;
    fus_compiler_frame_t *new_frame = NULL;
    err = fus_compiler_add_frame(compiler, parent, name, &new_frame);
    if(err)return err;
    err = fus_compiler_frame_init_sig(new_frame);
    if(err)return err;
    *frame_ptr = new_frame;
    return 0;
}

int fus_compiler_add_frame_ref(fus_compiler_t *compiler,
    fus_compiler_frame_t *parent, char *name,
    fus_compiler_frame_t *other_frame,
    fus_compiler_frame_t **frame_ptr
){
    int err;
    fus_compiler_frame_t *new_frame = NULL;
    err = fus_compiler_add_frame(compiler, parent, name, &new_frame);
    if(err)return err;
    new_frame->type = FUS_COMPILER_FRAME_TYPE_REF;
    new_frame->data.ref = other_frame;
    *frame_ptr = new_frame;
    return 0;
}



/* COMPILER PUSH AND POP FRAME */

int fus_compiler_push_frame_def(fus_compiler_t *compiler,
    fus_compiler_frame_t *frame
){
    compiler->cur_frame = frame;
    return 0;
}

int fus_compiler_pop_frame_def(fus_compiler_t *compiler){
    int err;
    fus_compiler_frame_t *frame = compiler->cur_frame;
    if(frame == NULL){
        ERR_INFO();
        fprintf(stderr, "No frame to pop\n");
        return 2;
    }

    err = fus_compiler_finish_def(compiler, frame);
    if(err)return err;

    compiler->cur_frame = frame->parent;
    return 0;
}

int fus_compiler_finish_def(fus_compiler_t *compiler,
    fus_compiler_frame_t *def
){
    /* NOTE: def is allowed to be NULL.
    This function searches through its children and essentially
    transforms various kinds of "forward declaration" into refs. */
    int err;
    for(int i = 0; i < compiler->frames_len; i++){
        fus_compiler_frame_t *frame = compiler->frames[i];
        if(frame->parent != def)continue;
        if(frame->type != FUS_COMPILER_FRAME_TYPE_REF
            && !frame->compiled
        ){
            if(frame->type == FUS_COMPILER_FRAME_TYPE_DEF
                && frame->data.def.load_path != NULL
            ){
                /* Don't worry about it, gonna get compiled from
                file later */
            }else if(def == NULL){
                ERR_INFO();
                fprintf(stderr,
                    "Frame declared but not compiled: %i (%s)\n",
                    frame->i, frame->name);
                return 2;
            }else{
                /* At end of def, for all frames still not compiled,
                find_or_add in parent def for frame->name, and turn
                uncompiled frame into a ref to that. */
                fus_compiler_frame_t *other_frame = NULL;
                if(frame->type == FUS_COMPILER_FRAME_TYPE_DEF){
                    err = fus_compiler_find_or_add_frame_def(compiler,
                        def->parent, frame->name, strlen(frame->name),
                        frame->data.def.is_module, &other_frame);
                    if(err)return err;
                }else if(frame->type == FUS_COMPILER_FRAME_TYPE_SIG){
                    err = fus_compiler_find_or_add_frame_sig(compiler,
                        def->parent, frame->name, strlen(frame->name),
                        &other_frame);
                    if(err)return err;
                }else{
                    ERR_INFO();
                    fprintf(stderr,
                        "Dunno how to handle frame type: %s\n",
                        fus_compiler_frame_type_to_s(frame));
                    return 2;
                }
                err = fus_compiler_convert_frame_to_ref(compiler,
                    frame, other_frame);
                if(err)return err;
            }
        }
    }
    return 0;
}



/* COMPILER FIND FRAME */

int fus_compiler_find_frame(
    fus_compiler_t *compiler, fus_compiler_frame_t *parent,
    const char *token, int token_len,
    int type, fus_compiler_frame_t **frame_ptr
){
    if(token_len > 0 && token[0] != '<'){
        for(int i = 0; i < compiler->frames_len; i++){
            fus_compiler_frame_t *frame = compiler->frames[i];
            if(frame->parent != parent)continue;
            if(!(
                frame->name[0] != '<' &&
                strlen(frame->name) == token_len &&
                !strncmp(frame->name, token, token_len)
            ))continue;
            while(frame->type == FUS_COMPILER_FRAME_TYPE_REF){
                frame = frame->data.ref;}
            if(type != FUS_COMPILER_FRAME_TYPE_ANY
                && frame->type != type)continue;
            *frame_ptr = frame;
            return 0;
        }
    }
    *frame_ptr = NULL;
    return 0;
}

int fus_compiler_find_frame_def(
    fus_compiler_t *compiler, fus_compiler_frame_t *parent,
    const char *token, int token_len,
    bool is_module, fus_compiler_frame_t **frame_ptr
){
    int err;
    fus_compiler_frame_t *frame = NULL;
    err = fus_compiler_find_frame(compiler, parent, token, token_len,
        FUS_COMPILER_FRAME_TYPE_DEF, &frame);
    if(err)return err;
    if(frame != NULL){
        if(frame->data.def.is_module != is_module){
            ERR_INFO();
            fprintf(stderr, "Found %s when expecting %s: %i (%s)\n",
                frame->data.def.is_module? "module": "def",
                is_module? "module": "def",
                frame->i, frame->name);
            return 2;
        }
    }
    *frame_ptr = frame;
    return 0;
}

int fus_compiler_find_frame_sig(
    fus_compiler_t *compiler, fus_compiler_frame_t *parent,
    const char *token, int token_len,
    fus_compiler_frame_t **frame_ptr
){
    int err;
    fus_compiler_frame_t *frame = NULL;
    err = fus_compiler_find_frame(compiler, parent, token, token_len,
        FUS_COMPILER_FRAME_TYPE_SIG, &frame);
    if(err)return err;
    *frame_ptr = frame;
    return 0;
}



/* COMPILER FIND OR ADD FRAME */

int fus_compiler_find_or_add_frame_def(
    fus_compiler_t *compiler, fus_compiler_frame_t *parent,
    const char *token, int token_len,
    bool is_module, fus_compiler_frame_t **frame_ptr
){
    int err;
    fus_compiler_frame_t *frame = NULL;
    err = fus_compiler_find_frame_def(compiler, parent,
        token, token_len, is_module, &frame);
    if(err)return err;
    if(frame == NULL){
        int err = fus_compiler_add_frame_def(compiler, parent,
            strndup(token, token_len), is_module, &frame);
        if(err)return err;
    }
    *frame_ptr = frame;
    return 0;
}

int fus_compiler_find_or_add_frame_sig(
    fus_compiler_t *compiler, fus_compiler_frame_t *parent,
    const char *token, int token_len,
    fus_compiler_frame_t **frame_ptr
){
    int err;
    fus_compiler_frame_t *frame = NULL;
    err = fus_compiler_find_frame_sig(compiler, parent, token, token_len,
        &frame);
    if(err)return err;
    if(frame == NULL){
        int err = fus_compiler_add_frame_sig(compiler, parent,
            strndup(token, token_len), &frame);
        if(err)return err;
    }
    *frame_ptr = frame;
    return 0;
}


int fus_compiler_convert_frame_to_ref(fus_compiler_t *compiler,
    fus_compiler_frame_t *frame, fus_compiler_frame_t *other_frame
){
    int err;
    if(frame->type != other_frame->type){
        /* Caller is responsible for making sure this never happens */
        ERR_INFO();
        fprintf(stderr, "Frame type mismatch: %s != %s\n",
            fus_compiler_frame_type_to_s(frame),
            fus_compiler_frame_type_to_s(other_frame));
        return 2;
    }else if(frame->compiled){
        /* Caller is responsible for making sure this never happens */
        ERR_INFO();
        fprintf(stderr, "Frame is already compiled\n");
        return 2;
    }
    frame->type = FUS_COMPILER_FRAME_TYPE_REF;
    frame->data.ref = other_frame;

    /* Turn ref's children into refs too */
    for(int i = 0; i < compiler->frames_len; i++){
        fus_compiler_frame_t *child = compiler->frames[i];
        if(child->parent != frame)continue;
        if(child->type == FUS_COMPILER_FRAME_TYPE_REF)continue;

        /* TODO: This whole system is getting a bit gross.
        Let's change it so we first generate the entire frame tree,
        then go through and resolve names once, without all these temporary
        uncompiled things which get transformed into refs... */

        fus_compiler_frame_t *other_child = NULL;
        if(child->type == FUS_COMPILER_FRAME_TYPE_DEF){
            err = fus_compiler_find_or_add_frame_def(compiler,
                other_frame, child->name, strlen(child->name),
                child->data.def.is_module, &other_child);
            if(err)return err;
        }else if(child->type == FUS_COMPILER_FRAME_TYPE_SIG){
            err = fus_compiler_find_or_add_frame_sig(compiler,
                other_frame, child->name, strlen(child->name),
                &other_child);
            if(err)return err;
        }else{
            ERR_INFO();
            fprintf(stderr, "Unknown frame type: %i\n", child->type);
            return 2;
        }

        /* Turn child into a ref! Recuuuuursion */
        err = fus_compiler_convert_frame_to_ref(compiler,
            child, other_child);
        if(err)return err;
    }

    return 0;
}
