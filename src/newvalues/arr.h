#ifndef _FUS_ARR_H_
#define _FUS_ARR_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


#define FUS_ARR_VALUES(A) ( (fus_value_t*)(A).values.elems )


struct fus_arr {
    fus_array_t values;
};


void fus_arr_init(fus_vm_t *vm, fus_arr_t *a);
void fus_arr_copy(fus_vm_t *vm, fus_arr_t *a, fus_arr_t *a2);
void fus_arr_cleanup(fus_vm_t *vm, fus_arr_t *a);

fus_array_len_t fus_arr_len(fus_vm_t *vm, fus_arr_t *a);
fus_value_t fus_arr_get(fus_vm_t *vm, fus_arr_t *a, int i);
void fus_arr_push(fus_vm_t *vm, fus_arr_t *a, fus_value_t value);
void fus_arr_pop(fus_vm_t *vm, fus_arr_t *a, fus_value_t *value_ptr);

void fus_boxed_arr_mkunique(fus_boxed_t **p_ptr);

fus_value_t fus_value_arr(fus_vm_t *vm);
fus_value_t fus_value_arr_from_arr(fus_vm_t *vm, fus_arr_t *a);
fus_value_t fus_value_arr_len(fus_vm_t *vm, fus_value_t value);
fus_value_t fus_value_arr_get(fus_vm_t *vm, fus_value_t value,
    fus_value_t value_i);
fus_value_t fus_value_arr_get_i(fus_vm_t *vm, fus_value_t value, int i);
void fus_value_arr_push(fus_vm_t *vm, fus_value_t *value_a_ptr,
    fus_value_t value);
void fus_value_arr_pop(fus_vm_t *vm, fus_value_t *value_a_ptr,
    fus_value_t *value_ptr);


/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_init_arr(fus_class_t *class, void *ptr);
void fus_class_cleanup_arr(fus_class_t *class, void *ptr);


#endif