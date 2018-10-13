
#include "includes.h"



#define FUS_VM_CLASS_INIT(NAME, T) \
    fus_class_init_zero(&vm->class_##NAME, core, #NAME, sizeof(T), \
        &vm->value_class_data);

#define FUS_VM_CLASS_CLEANUP(NAME, T) \
    fus_class_cleanup(&vm->class_##NAME);


void fus_vm_init(fus_vm_t *vm, fus_core_t *core){
    vm->core = core;
    vm->n_boxed = 0;

    fus_value_class_data_init(&vm->value_class_data, vm);

    FUS_VM_SIMPLE_CLASSES_DO(FUS_VM_CLASS_INIT)

    /* Init non-simple classes: */
    fus_class_init(&vm->class_value, core,
        "value", sizeof(fus_value_t), &vm->value_class_data,
        &fus_class_init_value,
        &fus_class_cleanup_value);
}

void fus_vm_cleanup(fus_vm_t *vm){
    if(vm->n_boxed != 0){
        fprintf(stderr, "%s: WARNING: "
            "Cleanup of vm with nonzero n_boxed: %i\n",
            __func__, vm->n_boxed);
        fflush(stderr);
    }
    FUS_VM_SIMPLE_CLASSES_DO(FUS_VM_CLASS_CLEANUP)
    FUS_VM_CLASSES_DO(FUS_VM_CLASS_CLEANUP)
}

