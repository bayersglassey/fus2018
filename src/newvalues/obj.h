#ifndef _FUS_OBJ_H_
#define _FUS_OBJ_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


struct fus_obj {
    fus_arr_t keys;
    fus_arr_t values;
};


void fus_obj_init(fus_obj_t *o, fus_vm_t *vm);
void fus_obj_copy(fus_obj_t *o, fus_obj_t *o2);
void fus_obj_cleanup(fus_obj_t *o);

void fus_boxed_obj_mkunique(fus_boxed_t **p_ptr);

fus_value_t fus_value_obj(fus_vm_t *vm);
fus_value_t fus_value_obj_from_obj(fus_vm_t *vm, fus_obj_t *o);


#endif