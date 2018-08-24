#ifndef _FUS_VALUE_H_
#define _FUS_VALUE_H_

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
    FUS_TYPES
};
#define FUS_TYPE_ANY FUS_TYPES

typedef unsigned char fus_type_t;

typedef struct fus_value {
    fus_type_t type;
    union {
        int i;
        bool b;
        struct fus_bigint *bi;
        struct fus_str *s;
        struct fus_arr *a;
        struct fus_obj *o;
        struct fus_code *f;
        const char *msg;
    } data;
} fus_value_t;

typedef struct fus_bigint {
    int refcount;
    ARRAY_DECL(int, digits)
} fus_bigint_t;

typedef struct fus_str {
    int refcount;
    ARRAY_DECL(char, text)
} fus_str_t;

typedef struct fus_arr {
    int refcount;
    ARRAY_DECL(struct fus_value, values)
} fus_arr_t;

typedef struct fus_obj_entry {
    int sym_i;
    fus_value_t value;
} fus_obj_entry_t;

typedef struct fus_obj {
    int refcount;
    ARRAY_DECL(fus_obj_entry_t, entries)
} fus_obj_t;



int fus_type_get_sym_i(fus_type_t type);
char fus_type_to_c(fus_type_t type);
fus_type_t fus_type_from_c(char c);

#if FUS_ENABLE_BACKTRACE
    #define FUS_ATTACH_DEBUG_PRINT(T, t, txt) { \
        printf(">>> "); \
        fus_##T##_print(t, NULL, stdout, 0, 0); \
        printf(" refcount=%i " txt "\n", t->refcount); \
        BACKTRACE \
    }
#else
    #define FUS_ATTACH_DEBUG_PRINT(T, t, txt) ;
#endif


#define FUS_ATTACH(T, t0) { \
    fus_##T##_t *t = (t0); \
    if(t != NULL){ \
        FUS_ATTACH_DEBUG_PRINT(T, t, "++") \
        t->refcount++; \
    } \
}

#define FUS_DETACH(T, t0) { \
    fus_##T##_t *t = (t0); \
    if(t != NULL){ \
        FUS_ATTACH_DEBUG_PRINT(T, t, "--") \
        t->refcount--; \
        if(t->refcount <= 0){ \
            if(t->refcount < 0){ \
                fprintf(stderr, #T " with negative refcount: "); \
                fus_##T##_print(t, NULL, stderr, 0, 0); \
                fprintf(stderr, "\n"); \
                BACKTRACE \
            } \
            fus_##T##_cleanup(t); \
            free(t); \
            (t0) = NULL; \
        } \
    } \
}

#define FUS_VALUE_MKUNIQUE(T, t) { \
    if((t) == NULL){ \
        fus_##T##_t *new_t = malloc(sizeof(*new_t)); \
        if(new_t == NULL)return 1; \
        fus_##T##_init(new_t); \
        (t) = new_t; \
    }else{ \
        if((t)->refcount > 1){ \
            fus_##T##_t *new_t = malloc(sizeof(*t)); \
            if(new_t == NULL)return 1; \
            fus_##T##_copy(new_t, (t)); \
            (t) = new_t; \
        } \
    } \
    (t)->refcount = 1; \
}

void fus_value_attach(fus_value_t value);
void fus_value_detach(fus_value_t value);
void fus_value_cleanup(fus_value_t value);

fus_value_t fus_value_null();
fus_value_t fus_value_bool(bool b);
fus_value_t fus_value_int(int i);
fus_str_t *fus_str(char *ss);
fus_value_t fus_value_str(fus_str_t *s);
fus_value_t fus_value_sym(int sym_i);
fus_value_t fus_value_arr(fus_arr_t *a);
fus_value_t fus_value_obj(fus_obj_t *o);
fus_value_t fus_value_fun(struct fus_code *code);

void fus_bigint_cleanup(fus_bigint_t *bi);
void fus_str_cleanup(fus_str_t *s);
void fus_arr_cleanup(fus_arr_t *a);
int fus_arr_init(fus_arr_t *a);
int fus_arr_copy(fus_arr_t *a, fus_arr_t *a0);
struct fus_stack;
    int fus_arr_copy_stack(fus_arr_t *a, struct fus_stack *stack);
int fus_arr_push(fus_arr_t *a, fus_value_t value);
int fus_arr_push_l(fus_arr_t *a, fus_value_t value);
int fus_arr_pop(fus_arr_t *a, fus_value_t *value_ptr);
int fus_arr_pop_l(fus_arr_t *a, fus_value_t *value_ptr);
int fus_arr_len(fus_arr_t *a);
void fus_obj_entry_cleanup(fus_obj_entry_t *entry);
int fus_obj_entry_init(fus_obj_entry_t *entry, int sym_i,
    fus_value_t value);
void fus_obj_cleanup(fus_obj_t *o);
int fus_obj_init(fus_obj_t *o);
int fus_obj_copy(fus_obj_t *o, fus_obj_t *o0);
fus_obj_entry_t *fus_obj_get(fus_obj_t *o, int sym_i);
int fus_obj_set(fus_obj_t *o, int sym_i, fus_value_t value);
int fus_obj_keys(fus_obj_t *o, fus_arr_t **a_ptr);

void fus_bigint_print(fus_bigint_t *bi, fus_symtable_t *symtable, FILE *f,
    int indent, int depth);
void fus_str_print(fus_str_t *s, fus_symtable_t *symtable, FILE *f,
    int indent, int depth);
void fus_arr_print(fus_arr_t *a, fus_symtable_t *symtable, FILE *f,
    int indent, int depth);
void fus_obj_print(fus_obj_t *o, fus_symtable_t *symtable, FILE *f,
    int indent, int depth);
struct fus_code;
    void fus_fun_print(struct fus_code *code, fus_symtable_t *symtable, FILE *f,
        int indent, int depth);
void fus_value_print(fus_value_t value, fus_symtable_t *symtable,
    FILE *f, int indent, int depth);

#endif