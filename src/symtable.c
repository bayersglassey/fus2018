
#include "includes.h"



void fus_symtable_cleanup(fus_symtable_t *symtable){
    ARRAY_FREE(fus_sym_t, symtable->syms, fus_sym_cleanup);
}

int fus_symtable_init(fus_symtable_t *symtable){
    int err;
    ARRAY_INIT(symtable->syms)
    #define DEF_SYMCODE(m_code, m_token, m_argtype) { \
        fus_sym_t sym; \
        err = fus_sym_init(&sym, m_token, strlen(m_token)); \
        if(err)return err; \
        sym.argtype = FUS_SYMCODE_ARGTYPE_##m_argtype; \
        ARRAY_PUSH(fus_sym_t, symtable->syms, sym) \
    }
    #include "symcodes.inc"
    #undef DEF_SYMCODE
    return 0;
}


int fus_symtable_find(fus_symtable_t *symtable,
    const char *token, int token_len
){
    /* Returns sym's index if found, -1 if not found */
    for(int i = 0; i < symtable->syms_len; i++){
        fus_sym_t *sym = &symtable->syms[i];
        if(sym->token_len == token_len
            && !strncmp(sym->token, token, token_len)
        ){
            return i;
        }
    }
    return -1;
}

fus_sym_t *fus_symtable_get(fus_symtable_t *symtable, int sym_i){
    if(sym_i < 0 || sym_i >= symtable->syms_len)return NULL;
    return &symtable->syms[sym_i];
}

int fus_symtable_add(fus_symtable_t *symtable,
    const char *token, int token_len
){
    int err;
    fus_sym_t sym;
    err = fus_sym_init(&sym, token, token_len);
    if(err)return err;
    ARRAY_PUSH(fus_sym_t, symtable->syms, sym)
    return 0;
}

int fus_symtable_find_or_add(fus_symtable_t *symtable,
    const char *token, int token_len
){
    int sym_i = fus_symtable_find(symtable, token, token_len);
    if(sym_i >= 0)return sym_i;
    int err = fus_symtable_add(symtable, token, token_len);
    if(err)return -1;
    return symtable->syms_len - 1;
}

