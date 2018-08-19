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


#define FUS_CODE_OPCODES_PER_INT (sizeof(int) / sizeof(fus_opcode_t))


void fus_code_cleanup(fus_code_t *code);
int fus_code_init(fus_code_t *code);
void fus_code_print_opcodes(fus_code_t *code, int indent);
int fus_code_push_int(fus_code_t *code, int i);
int fus_code_get_int(fus_code_t *code, int opcode_i, int *i_ptr);
int fus_code_get_sym(fus_code_t *code, int opcode_i,
    fus_symtable_t *symtable, fus_sym_t **sym_ptr);
int fus_code_print_opcodes_detailed(fus_code_t *code,
    fus_symtable_t *symtable);



void fus_coderef_cleanup(fus_coderef_t *coderef);
int fus_coderef_init(fus_coderef_t *coderef, fus_code_t *code);


#endif