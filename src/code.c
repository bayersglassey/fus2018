
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

void fus_coderef_cleanup(fus_coderef_t *coderef){
}

int fus_coderef_init(fus_coderef_t *coderef, fus_code_t *code){
    coderef->opcode_i = 0;
    coderef->code = code;
    return 0;
}

