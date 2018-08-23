
#include "includes.h"


void fus_opcode_print(fus_opcode_t opcode, fus_symtable_t *symtable,
    FILE *f
){
    fus_sym_t *sym = fus_symtable_get(symtable, opcode);
    if(sym == NULL)fprintf(f, "OPCODE_NOT_FOUND");
    fprintf(f, "%s", sym->token);
}



void fus_signature_cleanup(fus_signature_t *sig){
    /* Nothing to do! */
}
int fus_signature_init(fus_signature_t *sig, int n_args_in, int n_args_out){
    sig->n_args_in = n_args_in;
    sig->n_args_out = n_args_out;
    return 0;
}



void fus_code_cleanup(fus_code_t *code){
    ARRAY_FREE(fus_opcode_t, code->opcodes, (void))
    ARRAY_FREE_BYVAL(fus_value_t, code->literals, fus_value_detach)
}

int fus_code_init(fus_code_t *code){
    int err;
    ARRAY_INIT(code->opcodes)
    ARRAY_INIT(code->literals)
    return 0;
}


void fus_code_print_opcode_at(fus_code_t *code, int opcode_i,
    fus_symtable_t *symtable, FILE *f
){
    int err;
    fus_opcode_t opcode = code->opcodes[opcode_i];
    fus_sym_t *opcode_sym = fus_symtable_get(symtable, opcode);
    if(opcode_sym == NULL){
        fprintf(f, "OPCODE_NO_SYM");
        return;
    }
    fprintf(f, "%s", opcode_sym->token);
    if(opcode_sym->argtype == FUS_SYMCODE_ARGTYPE_INT){
        int ii = 0;
        err = fus_code_get_int(code, opcode_i + 1, &ii);
        if(err){
            fprintf(f, " COULDNT_GET_INT");
        }else{
            fprintf(f, " %i", ii);
        }
    }else if(opcode_sym->argtype == FUS_SYMCODE_ARGTYPE_SYM){
        int sym_i = 0;
        err = fus_code_get_int(code, opcode_i + 1, &sym_i);
        if(err){
            fprintf(f, " COULDNT_GET_SYM_I");
        }else{
            fus_sym_t *sym = fus_symtable_get(symtable, sym_i);
            if(sym == NULL){
                fprintf(f, " COULDNT_GET_SYM");
            }else{
                fprintf(f, " %s", sym->token);
            }
        }
    }
}

void fus_code_print_opcodes(fus_code_t *code, int indent){
    for(int i = 0; i < indent; i++)printf(" ");
    for(int i = 0; i < code->opcodes_len; i++){
        fus_opcode_t opcode = code->opcodes[i];
        printf("%i ", opcode);
    }
    printf("\n");
}

int fus_code_push_int(fus_code_t *code, int i){
    int err;
    int n = FUS_CODE_OPCODES_PER_INT;
    for(int j = 0; j < n; j++){
        ARRAY_PUSH(fus_opcode_t, code->opcodes, 0)
    }
    int opcode_i = code->opcodes_len - n;
    *(int*)&code->opcodes[opcode_i] = i;
    return 0;
}

int fus_code_get_int(fus_code_t *code, int opcode_i, int *i_ptr){
    int err;
    *i_ptr = *(int*)&code->opcodes[opcode_i];
    return 0;
}

int fus_code_get_sym(fus_code_t *code, int opcode_i,
    fus_symtable_t *symtable, fus_sym_t **sym_ptr
){
    int err;
    int sym_i = -1;
    err = fus_code_get_int(code, opcode_i, &sym_i);
    if(err)return err;
    fus_sym_t *sym = fus_symtable_get(symtable, sym_i);
    if(sym == NULL)return 2;
    *sym_ptr = sym;
    return 0;
}

int fus_code_print_opcodes_detailed(fus_code_t *code,
    fus_symtable_t *symtable
){
    int err;
    for(int i = 0; i < code->opcodes_len;){
        fus_opcode_t opcode = code->opcodes[i];
        fus_sym_t *opcode_sym = fus_symtable_get(symtable, opcode);
        if(opcode_sym == NULL){
            ERR_INFO();
            fprintf(stderr, "Could not find sym for opcode %i\n", opcode);
            return 2;
        }else if(opcode_sym->argtype < 0
            || opcode_sym->argtype >= FUS_SYMCODE_ARGTYPES
        ){
            ERR_INFO();
            fprintf(stderr, "OPCODE %i: %i (%s) - ERROR: sym is not a "
                "standard opcode type\n",
                i, opcode, opcode_sym->token);
            return 2;
        }

#ifdef FUS_CODE_DEBUG
        printf("OPCODE %i: %i (", i, opcode);
        fus_code_print_opcode_at(code, i, symtable, stdout);
        printf(")\n");
#endif

        i += fus_symcode_argtype_get_size(opcode_sym->argtype);
    }
    return 0;
}






void fus_coderef_cleanup(fus_coderef_t *coderef){
    /* Nothing to do... */
}

int fus_coderef_init(fus_coderef_t *coderef, fus_code_t *code){
    coderef->opcode_i = 0;
    coderef->code = code;
    return 0;
}





int fus_lexer_get_sig(fus_lexer_t *lexer, fus_signature_t *sig){
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

