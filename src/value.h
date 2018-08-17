#ifndef _FUS_VALUE_H_
#define _FUS_VAULE_H_

#include "array.h"


enum {
    FUS_TYPE_NULL,
    FUS_TYPE_BOOL,
    FUS_TYPE_INT,
    FUS_TYPE_BIGINT,
    FUS_TYPE_STR,
    FUS_TYPE_SYM,
    FUS_TYPE_OBJ,
    FUS_TYPE_ARR,
    FUS_TYPE_FUN,
    FUS_TYPE_ERR,
    FUS_TYPES
};

typedef struct fus_value {
    unsigned char type;
    union {
        int i;
        bool b;
        struct fus_bigint *bi;
        struct fus_sym *y;
        struct fus_str *s;
        struct fus_arr *a;
        struct fus_obj *o;
        struct fus_fun *f;
        const char *msg;
    } data;
} fus_value_t;

typedef struct fus_bigint {
    int refcount;
    ARRAY_DECL(int, digits)
} fus_bigint_t;

typedef struct fus_sym {
    int token_len;
    char *token;
} fus_sym_t;

typedef struct fus_str {
    int refcount;
    ARRAY_DECL(char, text)
} fus_str_t;

typedef struct fus_arr {
    int refcount;
    ARRAY_DECL(struct fus_value, values)
} fus_arr_t;

typedef struct fus_obj_entry {
    fus_sym_t *key;
    fus_value_t value;
} fus_obj_entry_t;

typedef struct fus_obj {
    int refcount;
    ARRAY_DECL(fus_obj_entry_t, entries)
} fus_obj_t;

typedef struct fus_code {
    int x;
} fus_code_t;

typedef struct fus_fun {
    int refcount;
    //fus_code_t code;
} fus_fun_t;



void fus_value_attach(fus_value_t value);
void fus_value_detach(fus_value_t value);
void fus_value_cleanup(fus_value_t value);

fus_value_t fus_value_null();
fus_value_t fus_value_bool(bool b);
fus_value_t fus_value_int(int i);
fus_str_t *fus_str(const char *ss);
fus_value_t fus_value_str(const char *ss);
fus_value_t fus_value_sym(fus_sym_t *y);
fus_value_t fus_value_arr();
fus_value_t fus_value_obj();
fus_value_t fus_value_fun();
fus_value_t fus_value_err(const char *msg);

void fus_bigint_cleanup(fus_bigint_t *bi);
void fus_str_cleanup(fus_str_t *s);
void fus_arr_cleanup(fus_arr_t *a);
void fus_obj_entry_cleanup(fus_obj_entry_t *entry);
void fus_obj_cleanup(fus_obj_t *o);
void fus_fun_cleanup(fus_fun_t *f);


#endif