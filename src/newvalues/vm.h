#ifndef _FUS_VM_H_
#define _FUS_VM_H_

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


/* The following macro can be passed another macro */
#define FUS_VM_SIMPLE_CLASSES_DO(M) \
    M(char, char) \
    M(unboxed, fus_unboxed_t) \
    M(sym_i, fus_sym_i_t)

/* The following macro can be passed another macro */
#define FUS_VM_CLASSES_DO(M) \
    M(array, fus_array_t) \
    M(value, fus_value_t)

#define FUS_VM_CLASS_DECL(NAME, T) \
    fus_class_t class_##NAME;



struct fus_vm {
    fus_core_t *core;
    int n_boxed;

    fus_value_class_data_t value_class_data;
    int array_class_data; /* dummy to make FUS_VM_CLASS_INIT happy */

    FUS_VM_SIMPLE_CLASSES_DO(FUS_VM_CLASS_DECL)
    FUS_VM_CLASSES_DO(FUS_VM_CLASS_DECL)
};

void fus_vm_init(fus_vm_t *vm, fus_core_t *core);
void fus_vm_cleanup(fus_vm_t *vm);


#endif