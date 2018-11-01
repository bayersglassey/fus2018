
#include "includes.h"


void fus_obj_init(fus_vm_t *vm, fus_obj_t *o){
    fus_array_init(&o->keys, &vm->class_sym_i);
    fus_arr_init(vm, &o->values);
}

void fus_obj_copy(fus_vm_t *vm, fus_obj_t *o, fus_obj_t *o2){
    /* Acts like obj_init for o */
    fus_array_copy(&o->keys, &o2->keys);
    fus_arr_copy(vm, &o->values, &o2->values);

    /* Attach all values */
    fus_value_t *values = FUS_ARR_VALUES(o2->values);
    int values_len = o2->values.values.len;
    for(int i = 0; i < values_len; i++)fus_value_attach(vm, values[i]);
}

void fus_obj_cleanup(fus_vm_t *vm, fus_obj_t *o){
    fus_array_cleanup(&o->keys);
    fus_arr_cleanup(vm, &o->values);
}

int fus_obj_find(fus_vm_t *vm, fus_obj_t *o, int sym_i){
    int keys_len = o->keys.len;
    int *keys = FUS_ARRAY_GET_REF(o->keys, 0);
    for(int i = 0; i < keys_len; i++){
        int key = keys[i];
        if(key == sym_i)return i;
    }
    return -1;
}

fus_value_t fus_obj_get(fus_vm_t *vm, fus_obj_t *o, int sym_i){
    int i = fus_obj_find(vm, o, sym_i);
    if(i < 0)return fus_value_err(vm, FUS_ERR_MISSING_KEY);
    fus_value_t *values = FUS_ARR_VALUES(o->values);
    fus_value_t value = values[i];
    return value;
}

void fus_obj_set(fus_vm_t *vm, fus_obj_t *o, int sym_i, fus_value_t value){
    /* Transfers ownership of value */

    int i = fus_obj_find(vm, o, sym_i);
    if(i >= 0){
        /* Detach old value, replace with new value */
        fus_value_t *values = FUS_ARR_VALUES(o->values);
        fus_value_detach(vm, values[i]);
        values[i] = value;
    }else{
        /* Push new key & value */
        fus_array_push(&o->keys);
        int *keys = FUS_ARRAY_GET_REF(o->keys, 0);
        keys[o->keys.len - 1] = sym_i;
        fus_arr_push(vm, &o->values, value);
    }
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

fus_value_t fus_value_obj_get(fus_vm_t *vm, fus_value_t value_o, int sym_i){
    /* Return element at index sym_i of value_a.
    Increases element's refcount. */
    if(!fus_value_is_obj(value_o))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    fus_obj_t *o = &value_o.p->data.o;
    fus_value_t value = fus_obj_get(vm, o, sym_i);
    return value;
}

void fus_value_obj_set(fus_vm_t *vm, fus_value_t *value_o_ptr, int sym_i,
    fus_value_t value
){
    /* Represents a transfer of ownership of value to value_o.
    So refcounts of value and value_o are unchanged
    (Except in case of error, when they are both decremented) */

    /* Typecheck */
    fus_value_t value_o = *value_o_ptr;
    if(!fus_value_is_obj(value_o)){
        fus_value_detach(vm, value_o);
        fus_value_detach(vm, value);
        *value_o_ptr = fus_value_err(vm, FUS_ERR_WRONG_TYPE);
        return;
    }

    /* Uniqueness guarantee */
    fus_boxed_obj_mkunique(&value_o.p);

    /* Get obj and set key-value pair */
    fus_obj_t *o = &value_o.p->data.o;
    fus_obj_set(vm, o, sym_i, value);

    /* Return */
    *value_o_ptr = value_o;
}
