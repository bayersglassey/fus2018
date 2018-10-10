#ifndef _FUS_COLLECTION_H_
#define _FUS_COLLECTION_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */



typedef enum {
    FUS_COLLECTION_ARR,
    FUS_COLLECTION_OBJ,
    FUS_COLLECTION_STR,
    FUS_COLLECTION_FUN,
    FUS_COLLECTIONS
} fus_collection_type_t;

typedef struct fus_arr {
    fus_array_t values;
} fus_arr_t;

typedef struct fus_obj {
    fus_array_t keys;
    fus_array_t values;
} fus_obj_t;

typedef struct fus_str {
    fus_array_t text;
} fus_str_t;

typedef struct fus_fun {
    /* not sure what goes in here yet...
    dummy member because C doesn't allow empty struct */
    int dummy;
} fus_fun_t;

typedef struct fus_collection {
    fus_collection_type_t type;
    union {
        fus_arr_t a;
        fus_obj_t o;
        fus_str_t s;
        fus_fun_t f;
    } data;
} fus_collection_t;



void fus_collection_init(fus_collection_t *c, struct fus_vm *vm,
    fus_collection_type_t type);
void fus_collection_cleanup(fus_collection_t *c);

#endif