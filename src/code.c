
#include "includes.h"



void fus_code_cleanup(fus_code_t *code){
    ARRAY_FREE(fus_opcode_t, code->opcodes, (void))
    ARRAY_FREE_BYVAL(fus_value_t, code->literals, fus_value_detach)
}

int fus_code_init(fus_code_t *code){
    ARRAY_INIT(code->opcodes)
    ARRAY_INIT(code->literals)
    return 0;
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
    int n = sizeof(int) / sizeof(fus_opcode_t);
    for(int j = 0; j < n; j++){
        ARRAY_PUSH(fus_opcode_t, code->opcodes, 0)
    }
    int opcode_i = code->opcodes_len - n;
    *(int*)&code->opcodes[opcode_i] = i;
    return 0;
}

int fus_code_get_int(fus_code_t *code, int opcode_i, int *i_ptr){
    int err;
    int n = sizeof(int) / sizeof(fus_opcode_t);
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
    for(int i = 0; i < code->opcodes_len; i++){
        fus_opcode_t opcode = code->opcodes[i];
        fus_sym_t *opcode_sym = fus_symtable_get(symtable, opcode);
        if(opcode_sym == NULL){
            ERR_INFO();
            fprintf(stderr, "Could not find sym for opcode %i\n", opcode);
            return 2;
        }else if(opcode_sym->argtype == FUS_SYMCODE_ARGTYPE_INT){
            int ii = 0;
            err = fus_code_get_int(code, i + 1, &ii);
            if(err)return err;
            printf("OPCODE %i: %i (%s %i)\n", i, opcode,
                opcode_sym->token, ii);
            int n = sizeof(int) / sizeof(fus_opcode_t);
            i += n;
        }else if(opcode_sym->argtype == FUS_SYMCODE_ARGTYPE_SYM){
            int sym_i = 0;
            err = fus_code_get_int(code, i + 1, &sym_i);
            if(err)return err;
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
            fprintf(stderr, "OPCODE %i: %i (%s) - ERROR: sym is not a "
                "standard opcode type\n",
                i, opcode, opcode_sym->token);
            return 2;
        }
    }
    return 0;
}






void fus_coderef_cleanup(fus_coderef_t *coderef){
}

int fus_coderef_init(fus_coderef_t *coderef, fus_code_t *code){
    coderef->opcode_i = 0;
    coderef->code = code;
    return 0;
}

