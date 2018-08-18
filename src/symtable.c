
#include "includes.h"



void fus_symtable_cleanup(fus_symtable_t *symtable){
    ARRAY_FREE(fus_sym_t, symtable->syms, fus_sym_cleanup);
}

int fus_symtable_init(fus_symtable_t *symtable){
    int err;
    int i = 0;
    ARRAY_INIT(symtable->syms)
    #define DEF_SYMCODE(code, token) { \
        fus_sym_t sym; \
        err = fus_sym_init(&sym, token, strlen(token), i); \
        if(err)return err; \
        ARRAY_PUSH(fus_sym_t, symtable->syms, sym) \
        i++; \
    }
    #include "symcodes.h"
    #undef DEF_SYMCODE
    return 0;
}


fus_sym_t *fus_symtable_find(fus_symtable_t *symtable,
    const char *token, int token_len
){
    for(int i = 0; i < symtable->syms_len; i++){
        fus_sym_t *sym = &symtable->syms[i];
        if(sym->token_len == token_len
            && !strncmp(sym->token, token, token_len)
        ){
            return sym;
        }
    }
    return NULL;
}

int fus_symtable_add(fus_symtable_t *symtable,
    const char *token, int token_len
){
    return 0;
}

