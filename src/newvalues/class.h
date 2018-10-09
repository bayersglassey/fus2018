#ifndef _FUS_CLASS_H_
#define _FUS_CLASS_H_

/* Simple class system to simplify memory management.
    All instances of a given class have the same size.
    The only class "methods" are init (initialize) and
    cleanup.
    It should always be valid to call cleanup on an
    instance which has been initialized.
    Sensible defaults are fus_class_instance_init_zero
    and fus_class_instance_cleanup_zero, which just
    zero the instance's memory. */


#include "core.h"


struct fus_class;
typedef int fus_class_instance_init_t(
    struct fus_class *class,
    void *instance);
typedef void fus_class_instance_cleanup_t(
    struct fus_class *class,
    void *instance);


typedef struct fus_class {
    fus_core_t *core;
    const char *name;
    size_t instance_size;
    fus_class_instance_init_t *instance_init;
    fus_class_instance_cleanup_t *instance_cleanup;
} fus_class_t;



int fus_class_init(
    fus_class_t *class,
    fus_core_t *core,
    const char *name,
    size_t instance_size,
    fus_class_instance_init_t *instance_init,
    fus_class_instance_cleanup_t *instance_cleanup
){
    class->core = core;
    class->name = name;
    class->instance_size = instance_size;
    class->instance_init = instance_init;
    class->instance_cleanup = instance_cleanup;
    return 0;
}

void fus_class_cleanup(fus_class_t *class){
    /* Nuthin yet */
}


int fus_class_instance_init(fus_class_t *class, void *instance){
    if(class->instance_init)return class->instance_init(class, instance);
    return 0;
}

void fus_class_instance_cleanup(fus_class_t *class, void *instance){
    if(class->instance_cleanup)class->instance_cleanup(class, instance);
}




int fus_class_instance_init_zero(fus_class_t *class, void *instance){
    fus_memset(class->core, instance, 0, class->instance_size);
    return 0;
}

void fus_class_instance_cleanup_zero(fus_class_t *class, void *instance){
    fus_memset(class->core, instance, 0, class->instance_size);
}

int fus_class_init_zero(
    fus_class_t *class,
    fus_core_t *core,
    const char *name,
    size_t instance_size
){
    return fus_class_init(class, core, name, instance_size,
        fus_class_instance_init_zero,
        fus_class_instance_cleanup_zero);
}


#endif