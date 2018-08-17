#ifndef _FUS_SYMTABLE_H_
#define _FUS_SYMTABLE_H_


typedef struct fus_symtable {
    ARRAY_DECL(fus_sym_t, syms)
} fus_symtable_t;

void fus_symtabe_cleanup(fus_symtable_t *symtable);
int fus_symtable_init(fus_symtable_t *symtable);


#endif