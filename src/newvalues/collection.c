

#include "includes.h"



#define FUS_COLLECTION_LOG_WEIRD_TYPE(type) \
    fprintf(stderr, "%s: Got weird collection type: %i\n", __func__, type);

void fus_collection_dump(fus_collection_t *c, FILE *file){
    fprintf(file, "address=%p, type=%i, refcount=%i\n",
        c, c->type, c->refcount);
}

void fus_collection_init(fus_collection_t *c, fus_vm_t *vm,
    fus_collection_type_t type
){
    if(c == NULL)return;
    c->type = type;
    c->refcount = 0;
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
    if(c == NULL)return;
    if(c->refcount != 0){
        fprintf(stderr, "%s: WARNING: "
            "Cleanup of value with nonzero refcount: ", __func__);
        fus_collection_dump(c, stderr);
        fflush(stderr);
    }
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

