

#include "array.h"


void fus_array_init(fus_array_t *array, fus_class_t *class){
    array->class = class;
    array->elems = NULL;
    array->len = 0;
    array->size = 0;
}

void fus_array_cleanup(fus_array_t *array){
    fus_class_t *class = array->class;
    size_t elem_size = class->instance_size;
    for(int i = 0; i < array->len; i++){
        void *elem = array->elems + i * elem_size;
        fus_class_instance_cleanup(class, elem);
    }
    fus_free(class->core, array->elems);
}

