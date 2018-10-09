#ifndef _FUS_COLLECTION_H_
#define _FUS_COLLECTION_H_

#include "array.h"
#include "vm.h"



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



#define FUS_COLLECTION_LOG_WEIRD_TYPE(type) \
    fprintf(stderr, "%s: Got weird collection type: %i\n", __func__, type);

void fus_collection_init(fus_collection_t *c, struct fus_vm *vm,
    fus_collection_type_t type
){
    c->type = type;
    if(type == FUS_COLLECTION_ARR){
        fus_arr_t *a = &c->data.a;
        fus_array_init(&a->values, &vm->class_value);
    }else if(type == FUS_COLLECTION_OBJ){
        fus_obj_t *o = &c->data.o;
        fus_array_init(&o->keys, &vm->class_sym_i);
        fus_array_init(&o->values, &vm->class_value);
    }else if(type == FUS_COLLECTION_STR){
        fus_str_t *s = &c->data.s;
        fus_array_init(&s->text, &vm->class_char);
    }else if(type == FUS_COLLECTION_FUN){
        /* TODO... */
    }else{
        FUS_COLLECTION_LOG_WEIRD_TYPE(type)
    }
}

void fus_collection_cleanup(fus_collection_t *c){
    fus_collection_type_t type = c->type;
    if(type == FUS_COLLECTION_ARR){
        fus_arr_t *a = &c->data.a;
        fus_array_cleanup(&a->values);
    }else if(type == FUS_COLLECTION_OBJ){
        fus_obj_t *o = &c->data.o;
        fus_array_cleanup(&o->keys);
        fus_array_cleanup(&o->values);
    }else if(type == FUS_COLLECTION_STR){
        fus_str_t *s = &c->data.s;
        fus_array_cleanup(&s->text);
    }else if(type == FUS_COLLECTION_FUN){
        /* TODO... */
    }else{
        FUS_COLLECTION_LOG_WEIRD_TYPE(type)
    }
}


#endif