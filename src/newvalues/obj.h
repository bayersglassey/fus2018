#ifndef _FUS_OBJ_H_
#define _FUS_OBJ_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


struct fus_obj {
    fus_array_t keys;
    fus_arr_t values;
};


void fus_obj_init(fus_vm_t *vm, fus_obj_t *o);
void fus_obj_copy(fus_vm_t *vm, fus_obj_t *o, fus_obj_t *o2);
void fus_obj_cleanup(fus_vm_t *vm, fus_obj_t *o);

int fus_obj_find(fus_vm_t *vm, fus_obj_t *o, int sym_i);
fus_value_t fus_obj_get(fus_vm_t *vm, fus_obj_t *o, int sym_i);
void fus_obj_set(fus_vm_t *vm, fus_obj_t *o, int sym_i, fus_value_t value);

void fus_boxed_obj_mkunique(fus_boxed_t **p_ptr);

fus_value_t fus_value_obj(fus_vm_t *vm);
fus_value_t fus_value_obj_from_obj(fus_vm_t *vm, fus_obj_t *o);
fus_value_t fus_value_obj_get(fus_vm_t *vm, fus_value_t value_o,
    fus_value_t value_sym);
void fus_value_obj_set(fus_vm_t *vm, fus_value_t *value_o_ptr,
    fus_value_t value_sym, fus_value_t value);


#endif