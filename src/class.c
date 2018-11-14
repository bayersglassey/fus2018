

#include "class.h"



void fus_class_init(
    fus_class_t *class,
    fus_core_t *core,
    const char *name,
    size_t instance_size,
    void *data,
    fus_class_instance_init_t *instance_init,
    fus_class_instance_cleanup_t *instance_cleanup
){
    class->core = core;
    class->name = name;
    class->instance_size = instance_size;
    class->data = data;
    class->instance_init = instance_init;
    class->instance_cleanup = instance_cleanup;
}

void fus_class_cleanup(fus_class_t *class){
    /* Nuthin yet */
}


void fus_class_instance_init(fus_class_t *class, void *instance){
    if(class->instance_init)class->instance_init(class, instance);
}

void fus_class_instance_cleanup(fus_class_t *class, void *instance){
    if(class->instance_cleanup)class->instance_cleanup(class, instance);
}




void fus_class_instance_init_zero(fus_class_t *class, void *instance){
    fus_memset(class->core, instance, 0, class->instance_size);
}

void fus_class_instance_cleanup_zero(fus_class_t *class, void *instance){
    fus_memset(class->core, instance, 0, class->instance_size);
}

void fus_class_init_zero(
    fus_class_t *class,
    fus_core_t *core,
    const char *name,
    size_t instance_size,
    void *data
){
    /* Just a shorthand for fus_class_init using instance_init_zero
    and instance_cleanup_zero, so you don't have to type them out... */
    fus_class_init(class, core, name, instance_size, data,
        fus_class_instance_init_zero,
        fus_class_instance_cleanup_zero);
}


