
#include "includes.h"


void fus_obj_init(fus_vm_t *vm, fus_obj_t *o){
    fus_arr_init(vm, &o->keys);
    fus_arr_init(vm, &o->values);
}

void fus_obj_copy(fus_vm_t *vm, fus_obj_t *o, fus_obj_t *o2){
    /* Acts like obj_init for o */
    fus_arr_copy(vm, &o->keys, &o2->keys);
    fus_arr_copy(vm, &o->values, &o2->values);
}

void fus_obj_cleanup(fus_vm_t *vm, fus_obj_t *o){
    fus_arr_cleanup(vm, &o->keys);
    fus_arr_cleanup(vm, &o->values);
}


void fus_boxed_obj_mkunique(fus_boxed_t **p_ptr){
    /* Guarantees that p will have refcount 1.
    Either leaves p alone if it already has refcount 1,
    or "splits" p into two copies, with refcounts
    old_refcount-1 and 1, and returning the copy with
    refcount 1. */

    fus_boxed_t *p = *p_ptr;
    if(p->refcount > 1){
        fus_boxed_detach(p);
        fus_boxed_t *new_p = fus_value_obj(p->vm).p;
        fus_obj_copy(p->vm, &new_p->data.o, &p->data.o);
        *p_ptr = new_p;
    }
}


fus_value_t fus_value_obj(fus_vm_t *vm){
    /* Creates a new, empty obj value. */
    fus_boxed_t *p = fus_malloc(vm->core, sizeof(*p));
    fus_boxed_init(p, vm, FUS_BOXED_OBJ);
    fus_obj_init(vm, &p->data.o);
    return (fus_value_t)p;
}

fus_value_t fus_value_obj_from_obj(fus_vm_t *vm, fus_obj_t *o){
    /* Creates a new obj value with the given obj. */
    fus_boxed_t *p = fus_malloc(vm->core, sizeof(*p));
    fus_boxed_init(p, vm, FUS_BOXED_OBJ);
    p->data.o = *o;
    return (fus_value_t)p;
}
