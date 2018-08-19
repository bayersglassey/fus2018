#ifndef _FUS_SYMTABLE_H_
#define _FUS_SYMTABLE_H_


typedef struct fus_symtable {
    ARRAY_DECL(fus_sym_t, syms)
} fus_symtable_t;

void fus_symtable_cleanup(fus_symtable_t *symtable);
int fus_symtable_init(fus_symtable_t *symtable);

int fus_symtable_find(fus_symtable_t *symtable,
    const char *token, int token_len);
fus_sym_t *fus_symtable_get(fus_symtable_t *symtable, int sym_i);
int fus_symtable_add(fus_symtable_t *symtable,
    const char *token, int token_len);
int fus_symtable_find_or_add(fus_symtable_t *symtable,
    const char *token, int token_len);


#endif