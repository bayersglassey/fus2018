#ifndef _FUS_INT_OPS_H_
#define _FUS_INT_OPS_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


fus_value_t fus_int_add(fus_vm_t *vm,
    fus_value_t value_x, fus_value_t value_y);
fus_value_t fus_int_sub(fus_vm_t *vm,
    fus_value_t value_x, fus_value_t value_y);
fus_value_t fus_int_mul(fus_vm_t *vm,
    fus_value_t value_x, fus_value_t value_y);


#endif