#ifndef _FUS_BOXED_H_
#define _FUS_BOXED_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */



typedef enum {
    FUS_BOXED_ARR,
    FUS_BOXED_OBJ,
    FUS_BOXED_STR,
    FUS_BOXED_FUN,
    FUS_BOXEDS
} fus_boxed_type_t;

struct fus_arr {
    fus_array_t values;
};

struct fus_obj {
    fus_array_t keys;
    fus_array_t values;
};

struct fus_str {
    fus_array_t text;
};

struct fus_fun {
    /* not sure what goes in here yet...
    dummy member because C doesn't allow empty struct */
    int dummy;
};

struct fus_boxed {
    fus_boxed_type_t type;
    int refcount;
    union {
        fus_arr_t a;
        fus_obj_t o;
        fus_str_t s;
        fus_fun_t f;
    } data;
};


void fus_boxed_dump(fus_boxed_t *p, FILE *file);

void fus_boxed_init(fus_boxed_t *p, fus_vm_t *vm,
    fus_boxed_type_t type);
void fus_boxed_cleanup(fus_boxed_t *p);

#endif