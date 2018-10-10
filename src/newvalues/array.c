

#include "array.h"


void fus_array_init(fus_array_t *array, fus_class_t *elem_class){
    array->elem_class = elem_class;
    array->elems = NULL;
    array->elems_len = 0;
    array->elems_maxlen = 0;
}

void fus_array_cleanup(fus_array_t *array){
    fus_class_t *elem_class = array->elem_class;
    size_t elem_size = elem_class->instance_size;
    for(int i = 0; i < array->elems_len; i++){
        void *elem = array->elems + i * elem_size;
        fus_class_instance_cleanup(elem_class, elem);
    }
    fus_free(elem_class->core, array->elems);
}

