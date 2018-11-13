#ifndef _FUS_VM_H_
#define _FUS_VM_H_

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


/* The following macro can be passed another macro */
#define FUS_VM_SIMPLE_CLASSES_DO(M) \
    M(char, char) \
    M(sym_i, int) \
    M(unboxed, fus_unboxed_t)

/* The following macro can be passed another macro */
#define FUS_VM_CLASSES_DO(M) \
    M(array, fus_array_t) \
    M(value, fus_value_t) \
    M(arr, fus_arr_t)

#define FUS_VM_CLASS_DECL(NAME, T) \
    fus_class_t class_##NAME;



struct fus_vm {
    fus_core_t *core;
    fus_symtable_t *symtable;
    int n_boxed;

#ifdef FUS_ENABLE_BOXED_LLIST
    /* Linked list of all boxed values, for debugging */
    fus_boxed_t *boxed_llist;
#endif

    FUS_VM_SIMPLE_CLASSES_DO(FUS_VM_CLASS_DECL)
    FUS_VM_CLASSES_DO(FUS_VM_CLASS_DECL)
};

void fus_vm_init(fus_vm_t *vm, fus_core_t *core,
    fus_symtable_t *symtable);
void fus_vm_cleanup(fus_vm_t *vm);


void fus_vm_error(fus_vm_t *vm, fus_err_code_t code);


#endif