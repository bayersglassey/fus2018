
#include "includes.h"



void fus_symtabe_cleanup(fus_symtable_t *symtable){
    ARRAY_FREE(fus_sym_t, symtable->syms, fus_sym_cleanup);
}

int fus_symtable_init(fus_symtable_t *symtable){
    int err;
    ARRAY_INIT(symtable->syms)
    #define DEF_SYMCODE(code, token) { \
        fus_sym_t sym; \
        err = fus_sym_init(&sym, token, strlen(token)); \
        if(err)return err; \
        ARRAY_PUSH(fus_sym_t, symtable->syms, sym) \
    }
    #include "symcodes.h"
    #undef DEF_SYMCODE
    return 0;
}

