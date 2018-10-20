

#include "includes.h"


void fus_arr_init(fus_arr_t *a, fus_vm_t *vm){
    fus_array_init(&a->values, &vm->class_value);
}

void fus_arr_cleanup(fus_arr_t *a){
    fus_array_cleanup(&a->values);
}



fus_array_len_t fus_arr_len(fus_arr_t *a){
    return a->values.len;
}

fus_value_t fus_arr_get(fus_arr_t *a, int i){
    fus_value_t value = FUS_ARR_VALUES(*a)[i];
    return value;
}

void fus_arr_push(fus_arr_t *a, fus_value_t value){
    /* Resize array */
    fus_array_push(&a->values);

    /* Poke value into last array element */
    FUS_ARR_VALUES(*a)[a->values.len - 1] = value;
}



void fus_boxed_arr_mkunique(fus_boxed_t **p_ptr){
    /* Guarantees that p will have refcount 1.
    Either leaves p alone if it already has refcount 1,
    or "splits" p into two copies, with refcounts
    old_refcount-1 and 1, and returning the copy with
    refcount 1. */

    fus_boxed_t *p = *p_ptr;
    if(p->refcount > 1){
        fus_boxed_detach(p);
        fus_boxed_t *new_p = fus_value_arr(p->vm).p;
        fus_array_copy(&new_p->data.a.values, &p->data.a.values);
        *p_ptr = new_p;
    }
}




fus_value_t fus_value_arr(fus_vm_t *vm){
    /* Creates a new, empty arr value. */
    fus_boxed_t *p = fus_malloc(vm->core, sizeof(*p));
    fus_boxed_init(p, vm, FUS_BOXED_ARR);
    fus_arr_init(&p->data.a, vm);
    return (fus_value_t)p;
}

fus_value_t fus_value_arr_from_arr(fus_vm_t *vm, fus_arr_t *a){
    /* Creates a new arr value with the given arr. */
    fus_boxed_t *p = fus_malloc(vm->core, sizeof(*p));
    fus_boxed_init(p, vm, FUS_BOXED_ARR);
    p->data.a = *a;
    return (fus_value_t)p;
}

fus_value_t fus_value_arr_len(fus_vm_t *vm, fus_value_t value){
    /* Return len of arr value as a new int value */
    if(!fus_value_is_arr(value))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    return fus_value_int(vm, fus_arr_len(&value.p->data.a));
}

fus_value_t fus_value_arr_get(fus_vm_t *vm, fus_value_t value_a,
    fus_unboxed_t i
){
    /* Return element i of value_a. Increases element's refcount. */
    if(!fus_value_is_arr(value_a))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    fus_arr_t *a = &value_a.p->data.a;
    if(i < 0 || i >= fus_arr_len(a)){
        return fus_value_err(vm, FUS_ERR_OUT_OF_BOUNDS);
    }
    fus_value_t value = fus_arr_get(a, i);
    fus_value_attach(vm, value);
    return value;
}

void fus_value_arr_push(fus_vm_t *vm, fus_value_t *value_a_ptr,
    fus_value_t value
){
    /* Represents a transfer of ownership of value to value_a.
    So refcounts of value and value_a are unchanged
    (Except in case of error, when they are both decremented) */

    /* Typecheck */
    fus_value_t value_a = *value_a_ptr;
    if(!fus_value_is_arr(value_a)){
        fus_value_detach(vm, value_a);
        fus_value_detach(vm, value);
        *value_a_ptr = fus_value_err(vm, FUS_ERR_WRONG_TYPE);
        return;
    }

    /* Uniqueness guarantee */
    fus_boxed_arr_mkunique(&value_a.p);

    /* Get arr and do the push */
    fus_arr_t *a = &value_a.p->data.a;
    fus_arr_push(a, value);

    /* Return */
    *value_a_ptr = value_a;
}



/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_init_arr(fus_class_t *class, void *ptr){
    fus_arr_t *a = ptr;
    fus_vm_t *vm = class->data;
    fus_arr_init(a, vm);
}

void fus_class_cleanup_arr(fus_class_t *class, void *ptr){
    fus_arr_t *a = ptr;
    fus_arr_cleanup(a);
}

