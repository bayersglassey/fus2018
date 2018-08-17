#ifndef _FUS_CODE_H_
#define _FUS_CODE_H_


typedef unsigned char fus_opcode_t;

typedef struct fus_code {
    ARRAY_DECL(fus_opcode_t, opcodes)
    ARRAY_DECL(fus_value_t, literals)
} fus_code_t;

typedef struct fus_coderef {
    int opcode_i;
    fus_code_t *code;
} fus_coderef_t;


void fus_code_cleanup(fus_code_t *code);
int fus_code_init(fus_code_t *code);

void fus_coderef_cleanup(fus_coderef_t *coderef);
int fus_coderef_init(fus_coderef_t *coderef, fus_code_t *code);


#endif