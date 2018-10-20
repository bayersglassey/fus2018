#ifndef _FUS_BOXED_H_
#define _FUS_BOXED_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


#define FUS_ARR_VALUES(A) ( (fus_value_t*)(A).values.elems )


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
    fus_vm_t *vm;
    fus_boxed_type_t type;
    int refcount;
    union {
        fus_arr_t a;
        fus_obj_t o;
        fus_str_t s;
        fus_fun_t f;
    } data;
};


const char *fus_boxed_type_msg(fus_boxed_type_t type);
void fus_boxed_dump(fus_boxed_t *p, FILE *file);

void fus_boxed_init(fus_boxed_t *p, fus_vm_t *vm,
    fus_boxed_type_t type);
void fus_boxed_cleanup(fus_boxed_t *p);
void fus_boxed_attach(fus_boxed_t *p);
void fus_boxed_detach(fus_boxed_t *p);



/*******
 * ARR *
 *******/

void fus_arr_init(fus_arr_t *a, fus_vm_t *vm);
void fus_arr_cleanup(fus_arr_t *a);

fus_array_len_t fus_arr_len(fus_arr_t *a);
fus_value_t fus_arr_get(fus_arr_t *a, int i);
void fus_arr_push(fus_arr_t *a, fus_value_t value);

void fus_boxed_arr_mkunique(fus_boxed_t **p_ptr);

bool fus_value_is_arr(fus_value_t value);
fus_value_t fus_value_arr(fus_vm_t *vm);
fus_value_t fus_value_arr_from_arr(fus_vm_t *vm, fus_arr_t *a);
fus_value_t fus_value_arr_len(fus_vm_t *vm, fus_value_t value);
fus_value_t fus_value_arr_get(fus_vm_t *vm, fus_value_t value,
    fus_unboxed_t i);
void fus_value_arr_push(fus_vm_t *vm, fus_value_t *value1_ptr,
    fus_value_t value2);


/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_init_arr(fus_class_t *class, void *ptr);
void fus_class_cleanup_arr(fus_class_t *class, void *ptr);


#endif