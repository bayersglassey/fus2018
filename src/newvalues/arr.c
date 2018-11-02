

#include "includes.h"


void fus_arr_init(fus_vm_t *vm, fus_arr_t *a){
    fus_array_init(&a->values, &vm->class_value);
}

void fus_arr_copy(fus_vm_t *vm, fus_arr_t *a, fus_arr_t *a2){
    /* Acts like arr_init for a */
    fus_array_copy(&a->values, &a2->values);

    /* Attach all values */
    fus_value_t *values = FUS_ARR_VALUES(*a2);
    int values_len = a2->values.len;
    for(int i = 0; i < values_len; i++)fus_value_attach(vm, values[i]);
}

void fus_arr_cleanup(fus_vm_t *vm, fus_arr_t *a){
    fus_array_cleanup(&a->values);
}



fus_array_len_t fus_arr_len(fus_vm_t *vm, fus_arr_t *a){
    return a->values.len;
}

fus_value_t fus_arr_get(fus_vm_t *vm, fus_arr_t *a, int i){
    fus_value_t value = FUS_ARR_VALUES(*a)[i];
    return value;
}

int fus_arr_set(fus_vm_t *vm, fus_arr_t *a, int i, fus_value_t value){
    /* Bounds check */
    if(i < 0 || i >= a->values.len)return -1;

    /* Get old element, detach it, replace it with new one */
    fus_value_t *value_ptr = &FUS_ARR_VALUES(*a)[i];
    fus_value_detach(vm, *value_ptr);
    *value_ptr = value;

    return 0;
}

void fus_arr_push(fus_vm_t *vm, fus_arr_t *a, fus_value_t value){
    /* Transfers ownership of value */

    /* Resize array */
    fus_array_push(&a->values);

    /* Poke value into last array element */
    FUS_ARR_VALUES(*a)[a->values.len - 1] = value;
}

int fus_arr_pop(fus_vm_t *vm, fus_arr_t *a, fus_value_t *value_ptr){
    /* Bounds check */
    if(a->values.len <= 0){
        *value_ptr = fus_value_err(vm, FUS_ERR_OUT_OF_BOUNDS);
        return -1;
    }

    /* Get value from last array element */
    *value_ptr = FUS_ARR_VALUES(*a)[a->values.len - 1];

    /* Resize array */
    fus_array_pop(&a->values);

    return 0;
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
        fus_arr_copy(p->vm, &new_p->data.a, &p->data.a);
        *p_ptr = new_p;
    }
}




fus_value_t fus_value_arr(fus_vm_t *vm){
    /* Creates a new, empty arr value. */
    fus_boxed_t *p = fus_malloc(vm->core, sizeof(*p));
    fus_boxed_init(p, vm, FUS_BOXED_ARR);
    fus_arr_init(vm, &p->data.a);
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
    return fus_value_int(vm, fus_arr_len(vm, &value.p->data.a));
}

fus_value_t fus_value_arr_get(fus_vm_t *vm, fus_value_t value_a,
    fus_value_t value_i
){
    return fus_value_arr_get_i(vm, value_a, fus_value_int_decode(value_i));
}

fus_value_t fus_value_arr_get_i(fus_vm_t *vm, fus_value_t value_a, int i){
    /* Return element i of value_a. */
    if(!fus_value_is_arr(value_a))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    fus_arr_t *a = &value_a.p->data.a;
    if(i < 0 || i >= fus_arr_len(vm, a)){
        return fus_value_err(vm, FUS_ERR_OUT_OF_BOUNDS);
    }
    fus_value_t value = fus_arr_get(vm, a, i);
    return value;
}

void fus_value_arr_set(fus_vm_t *vm, fus_value_t *value_a_ptr,
    fus_value_t value_i, fus_value_t value
){
    fus_value_arr_set_i(vm, value_a_ptr, fus_value_int_decode(value_i),
        value);
}

void fus_value_arr_set_i(fus_vm_t *vm, fus_value_t *value_a_ptr, int i,
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

    /* Get arr *before* mkunique is called */
    fus_arr_t *original_a = &value_a.p->data.a;

    /* Bounds check */
    if(i < 0 || i >= fus_arr_len(vm, original_a)){
        fus_value_detach(vm, value_a);
        fus_value_detach(vm, value);
        *value_a_ptr = fus_value_err(vm, FUS_ERR_OUT_OF_BOUNDS);
        return;
    }

    /* Uniqueness guarantee */
    fus_boxed_arr_mkunique(&value_a.p);

    /* Get arr and set the element */
    fus_arr_t *a = &value_a.p->data.a;
    fus_arr_set(vm, a, i, value);

    /* Return */
    *value_a_ptr = value_a;
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
    fus_arr_push(vm, a, value);

    /* Return */
    *value_a_ptr = value_a;
}

void fus_value_arr_pop(fus_vm_t *vm, fus_value_t *value_a_ptr,
    fus_value_t *value_ptr
){
    /* Represents a transfer of ownership of last value of value_a
    to value_ptr. */

    /* Typecheck */
    fus_value_t value_a = *value_a_ptr;
    if(!fus_value_is_arr(value_a)){
        fus_value_detach(vm, value_a);
        *value_a_ptr = fus_value_err(vm, FUS_ERR_WRONG_TYPE);
        *value_ptr = fus_value_err(vm, FUS_ERR_WRONG_TYPE);
        return;
    }

    /* Uniqueness guarantee */
    fus_boxed_arr_mkunique(&value_a.p);

    /* Get arr and do the pop */
    fus_arr_t *a = &value_a.p->data.a;
    if(fus_arr_pop(vm, a, value_ptr) < 0){
        fus_value_detach(vm, value_a);
        *value_a_ptr = fus_value_err(vm, FUS_ERR_OUT_OF_BOUNDS);
        /* fus_arr_pop already set *value_ptr to an err value */
        return;
    }

    /* Return */
    *value_a_ptr = value_a;
}



/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_init_arr(fus_class_t *class, void *ptr){
    fus_arr_t *a = ptr;
    fus_vm_t *vm = class->data;
    fus_arr_init(vm, a);
}

void fus_class_cleanup_arr(fus_class_t *class, void *ptr){
    fus_arr_t *a = ptr;
    fus_vm_t *vm = class->data;
    fus_arr_cleanup(vm, a);
}

